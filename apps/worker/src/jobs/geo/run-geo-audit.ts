import { createHash } from "node:crypto";
import {
  GEO_RULESET_VERSION,
  type GeoDimensionId,
  type NotMeasuredReason,
  type SelectablePage,
  buildAiCrawlerMatrix,
  computeReadiness,
  selectImportantPages,
} from "@seo-maker/core/geo";
import { type GeoAuditJob, type GeoPhase } from "@seo-maker/core/queue";
import { Prisma, prisma, resetGeoProgress, setGeoStatus, writeGeoPhase } from "@seo-maker/db";

/**
 * The GEO orchestrator.
 *
 * One job running its phases in sequence, matching the shape the competitor
 * pipeline uses: progress lives on the Project row, and "resume where it
 * failed" is just reading geoPhase.
 *
 * Only three phases are implemented today — select, crawler and score. The
 * other six write their dimensions as null with a reason, which `redistribute`
 * drops rather than scoring zero. That is why this ships useful before any of
 * the AI work exists, and why adding a phase later changes no other phase.
 */

/** Dimensions no phase can measure yet, with the reason shown in the UI. */
const PENDING_DIMENSIONS: Record<string, string> = {
  entityClarity: "Business understanding has not run for this site yet.",
  contentExtractability: "Content extractability analysis has not run yet.",
  answerCoverage: "Questions have not been generated for this project yet.",
  structuredData: "Structured data analysis has not run yet.",
  citationReadiness: "Citation readiness analysis has not run yet.",
  businessInfo: "Business information analysis has not run yet.",
};

export async function runGeoAuditJob(data: GeoAuditJob) {
  const { projectId } = data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new Error(`Project ${projectId} not found.`);
  }

  const crawlId = data.crawlId ?? project.latestCrawlId;
  const crawl = crawlId
    ? await prisma.crawl.findFirst({ where: { id: crawlId, projectId } })
    : await prisma.crawl.findFirst({
        where: { projectId, status: "completed" },
        orderBy: { startedAt: "desc" },
      });

  if (!crawl) {
    await setGeoStatus(prisma, projectId, {
      status: "failed",
      error: "Crawl the site before running an AI Search analysis.",
    });
    return;
  }

  await resetGeoProgress(prisma, projectId, { status: "running", total: 3 });

  const pages = await prisma.page.findMany({
    where: { crawlId: crawl.id },
    select: {
      id: true,
      url: true,
      status: true,
      statusCode: true,
      pageType: true,
      pageTypeScore: true,
      depth: true,
      inSitemap: true,
      wordCount: true,
      schemaCount: true,
      content: true,
      contentHash: true,
      evidence: true,
      robotsMeta: true,
      xRobotsTag: true,
      indexable: true,
      errorType: true,
      contentType: true,
    },
  });

  // --- select -------------------------------------------------------------
  await phase(projectId, "select");
  const { selected, deferred } = selectImportantPages(pages as SelectablePage[], {
    mode: data.mode,
  });

  const fingerprint = buildFingerprint(data.mode, selected, pages);

  // Nothing changed since the last completed run, so there is nothing to
  // recompute. This is what keeps opening the page from costing anything.
  if (!data.force) {
    const previous = await prisma.geoAudit.findFirst({
      where: { projectId, status: { in: ["completed", "partial"] }, inputFingerprint: fingerprint },
      orderBy: { startedAt: "desc" },
    });
    if (previous) {
      await prisma.project.update({
        where: { id: projectId },
        data: { geoLatestAuditId: previous.id },
      });
      await setGeoStatus(prisma, projectId, { status: "completed", phase: null, error: null });
      console.log(`GEO ${projectId}: unchanged since ${previous.id}, skipped`);
      return;
    }
  }

  const audit = await prisma.geoAudit.create({
    data: {
      projectId,
      crawlId: crawl.id,
      status: "running",
      mode: data.mode,
      trigger: data.trigger,
      inputFingerprint: fingerprint,
      rulesetVersion: GEO_RULESET_VERSION,
      aiAvailable: false,
      pagesSelected: selected.length,
      deferredPages: deferred.slice(0, 50).map((page) => ({
        url: page.url,
        importance: Math.round(page.importance),
      })) as unknown as Prisma.InputJsonValue,
    },
  });

  const errors: string[] = [];
  const measured: Record<GeoDimensionId, number | null> = {
    entityClarity: null,
    contentExtractability: null,
    answerCoverage: null,
    structuredData: null,
    aiCrawlerAccess: null,
    citationReadiness: null,
    businessInfo: null,
  };
  const reasons: NotMeasuredReason[] = Object.entries(PENDING_DIMENSIONS).map(
    ([dimension, reason]) => ({ dimension: dimension as GeoDimensionId, reason }),
  );

  // --- crawler ------------------------------------------------------------
  await phase(projectId, "crawler");
  let crawlerMatrix: Prisma.InputJsonValue | undefined;

  try {
    // `selectImportantPages` narrows to the fields it ranks on, so the robots
    // and indexability columns come back off the original rows.
    const byId = new Map(pages.map((page) => [page.id, page]));

    const access = buildAiCrawlerMatrix({
      robotsTxt: crawl.robotsTxt,
      robotsStatus: crawl.robotsTxt ? 200 : null,
      pages: selected.flatMap((page) => {
        const row = byId.get(page.id);
        if (!row) return [];
        return [
          {
            id: row.id,
            url: row.url,
            statusCode: row.statusCode,
            robotsMeta: row.robotsMeta,
            xRobotsTag: row.xRobotsTag,
            indexable: row.indexable,
            errorType: row.errorType,
            contentType: row.contentType,
            wordCount: row.wordCount,
          },
        ];
      }),
    });

    measured.aiCrawlerAccess = access.raw;
    crawlerMatrix = access as unknown as Prisma.InputJsonValue;

    if (access.raw == null) {
      reasons.push({
        dimension: "aiCrawlerAccess",
        reason: "No accessibility check produced an answer for this crawl.",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`crawler: ${message}`);
    reasons.push({ dimension: "aiCrawlerAccess", reason: "The accessibility check failed." });
    console.error(`GEO ${projectId}: crawler phase failed:`, message);
  }

  // --- score --------------------------------------------------------------
  await phase(projectId, "score");
  const readiness = computeReadiness(measured, reasons);

  // Never "completed" while six of the nine phases are unimplemented. The run
  // genuinely is partial, and saying otherwise would overstate what was
  // measured. It becomes "completed" when every dimension has a phase behind it.
  const status = readiness.score == null ? "failed" : "partial";

  await prisma.geoAudit.update({
    where: { id: audit.id },
    data: {
      status,
      phase: null,
      error: errors.length > 0 ? errors.join(" · ") : null,
      readinessScore: readiness.score,
      readinessBand: readiness.band,
      entityClarity: measured.entityClarity,
      contentExtractability: measured.contentExtractability,
      answerCoverage: measured.answerCoverage,
      structuredData: measured.structuredData,
      aiCrawlerAccess: measured.aiCrawlerAccess,
      citationReadiness: measured.citationReadiness,
      businessInfo: measured.businessInfo,
      measuredWeights: readiness.weights as unknown as Prisma.InputJsonValue,
      notMeasured: readiness.reasons as unknown as Prisma.InputJsonValue,
      parts: readiness.parts as unknown as Prisma.InputJsonValue,
      crawlerMatrix,
      pagesAnalyzed: selected.length,
      finishedAt: new Date(),
    },
  });

  await prisma.project.update({
    where: { id: projectId },
    data: { geoLatestAuditId: audit.id },
  });

  await setGeoStatus(prisma, projectId, {
    status: readiness.score == null ? "failed" : "completed",
    phase: null,
    error: errors.length > 0 ? errors.join(" · ") : null,
    aiUsed: false,
  });

  console.log(
    `GEO ${projectId}: ${status}, readiness ${readiness.score ?? "not measured"}, ` +
      `${readiness.notMeasured.length} dimension(s) unmeasured`,
  );
}

async function phase(projectId: string, name: GeoPhase) {
  await writeGeoPhase(prisma, projectId, name);
}

/**
 * Identifies the inputs a run depends on.
 *
 * Content hashes rather than timestamps, so a re-crawl that found the same
 * pages unchanged does not trigger a rerun. The ruleset version is included
 * because changing a formula must invalidate the cache — otherwise a scoring
 * fix would silently never reach a project whose content had not changed.
 */
function buildFingerprint(
  mode: string,
  selected: Array<{ id: string }>,
  pages: Array<{ id: string; contentHash: string | null }>,
) {
  const hashes = new Map(pages.map((page) => [page.id, page.contentHash ?? ""]));
  const body = selected
    .map((page) => `${page.id}:${hashes.get(page.id) ?? ""}`)
    .sort()
    .join("\n");

  return createHash("sha256")
    .update(`${GEO_RULESET_VERSION}\n${mode}\n${body}`)
    .digest("hex");
}
