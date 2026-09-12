import { prisma, readPerfProgress } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { PerformanceDashboard } from "@/components/project/PerformanceDashboard";
import { isCrawled } from "@/lib/page-audit";
import { defaultPerfPageIds, readPerfPageIds } from "@/lib/perf-scope";
import { toAuditView } from "@/lib/perf-view";
import { getAccountForUser } from "@/lib/plan";
import { PERF_ACTIVE } from "@/lib/performance";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { findHomepage, normalizeSiteUrl, pagePath } from "@/lib/site-url";

export default async function ProjectPerformancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const account = await getAccountForUser(userId);
  const maxPages = Math.max(project.maxPages, account.limits.maxPages);
  const homepage = findHomepage(project.pages, project.rootUrl);
  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const pageIds = project.pages.map((page) => page.id);
  const pathById = new Map(project.pages.map((page) => [page.id, pagePath(page.finalUrl ?? page.url)]));

  const [audits, progress] = await Promise.all([
    prisma.performanceAudit.findMany({
      where: { pageId: { in: pageIds } },
      orderBy: { createdAt: "desc" },
    }),
    readPerfProgress(prisma, project.id),
  ]);

  const suggestedIds = defaultPerfPageIds(project.pages, project.rootUrl, account.plan);
  const lastIds = readPerfPageIds(progress.perfPageIds).filter((pageId) =>
    project.pages.some((page) => page.id === pageId),
  );
  const initialSelected = lastIds.length > 0 ? lastIds : suggestedIds;
  const active = PERF_ACTIVE.has(project.perfStatus);
  const runningPageId =
    active && lastIds.length > 0
      ? (lastIds[Math.min(progress.perfDone, lastIds.length - 1)] ?? null)
      : null;

  const latestKeys = new Set<string>();
  const views = audits
    .filter((audit) => {
      const key = `${audit.pageId}:${audit.strategy}`;
      if (latestKeys.has(key)) return false;
      latestKeys.add(key);
      return true;
    })
    .map((audit) => toAuditView(audit, pathById.get(audit.pageId) ?? "/"));
  const homepageHistory = homepage
    ? audits
        .filter((audit) => audit.pageId === homepage.id)
        .map((audit) => ({
          createdAt: audit.createdAt.toISOString(),
          strategy: (audit.strategy === "desktop" ? "desktop" : "mobile") as "mobile" | "desktop",
          performance: audit.performance,
          lcp: audit.lcp,
          cls: audit.cls,
        }))
    : [];

  const pages = [...project.pages]
    .sort((a, b) => {
      if (a.id === homepage?.id) return -1;
      if (b.id === homepage?.id) return 1;
      return 0;
    })
    .map((page) => ({
      id: page.id,
      path: pagePath(page.finalUrl ?? page.url),
      title: page.title?.trim() ?? "",
      crawled: isCrawled(page),
    }));

  return (
    <>
      <CrawlRefresh status={project.perfStatus} intervalMs={3000} />
      <PerformanceDashboard
        projectId={project.id}
        hostname={hostname}
        plan={account.plan}
        planLabel={account.limits.label}
        projectStatus={project.status}
        maxPages={maxPages}
        homepageId={homepage?.id ?? null}
        pages={pages}
        audits={views}
        history={homepageHistory}
        suggestedIds={suggestedIds}
        initialSelected={initialSelected}
        active={active}
        runningPageId={runningPageId}
        perfStatus={project.perfStatus}
        perfError={project.perfError}
        perfDone={progress.perfDone}
        perfTotal={progress.perfTotal}
        lastRunAt={project.perfRunAt?.toISOString() ?? null}
      />
    </>
  );
}
