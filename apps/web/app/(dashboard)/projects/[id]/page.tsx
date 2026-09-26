import { compareCrawls } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { CrawlProgressView } from "@/components/project/CrawlProgressView";
import { CrawlStartPanel } from "@/components/project/CrawlStartPanel";
import { DiscoveryView } from "@/components/project/DiscoveryView";
import { ProjectOverview } from "@/components/project/ProjectOverview";
import { siteCrawlAllowance } from "@/lib/crawl-access";
import { getCrawlProgress } from "@/lib/crawl-progress";
import { keyOfPage, latestAudits, pageKeyIndex } from "@/lib/page-results";
import { aiConfigured, getPageRecommendation } from "@/lib/ai-results";
import { ensureSiteOpportunities } from "@/lib/opportunities";
import { getAccountForUser } from "@/lib/plan";
import { getCrawlHistory, getProjectForUser, requireUserId } from "@/lib/projects";
import { getCrawlQueueState } from "@/lib/queue";
import {
  discoveryState,
  loadInventory,
  priorityLimitFor,
  toInventoryRows,
  uncrawledPages,
} from "@/lib/site-inventory";
import { findHomepage, normalizeSiteUrl, siteKeyOf } from "@/lib/site-url";

export default async function ProjectOverviewPage({
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

  // While a crawl is queued or running, the overview is its progress view.
  // It switches to the real overview once the crawl's results are complete,
  // instead of opening on an empty site that fills in while you watch.
  const progress = await getCrawlProgress(project);
  const crawlLive = progress.state === "queued" || progress.state === "running";
  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const account = await getAccountForUser(userId);

  // Before the first crawl: discover the site's pages, then let the user
  // start the crawl of its Priority pages.
  if (!project.latestCrawlId && !crawlLive) {
    const discovery = discoveryState(project);
    if (
      discovery.status === "queued" ||
      discovery.status === "running" ||
      (discovery.status === "failed" && discovery.mode === "initial")
    ) {
      const queue = await getCrawlQueueState(project.id).catch(() => ({ workerOnline: true }));
      return <DiscoveryView projectId={project.id} hostname={hostname} initial={{ ...discovery, workerOnline: queue.workerOnline }} />;
    }
    const inventory = await loadInventory(project, account.limits);
    if (inventory.length > 0) {
      const allowance = await siteCrawlAllowance(userId, project.siteKey ?? siteKeyOf(project.rootUrl), account.limits);
      return (
        <CrawlStartPanel
          projectId={project.id}
          hostname={hostname}
          rows={toInventoryRows(inventory)}
          priorityLimit={priorityLimitFor(account.limits)}
          planLabel={account.limits.label}
          summary={discovery.result}
          crawlsLeft={allowance.remaining}
          notice={
            progress.state === "failed"
              ? `The last crawl stopped before it finished${progress.error ? ` (${progress.error.slice(0, 160)})` : ""}.`
              : progress.state === "cancelled"
                ? "You stopped the last crawl before any page was saved."
                : null
          }
        />
      );
    }
  }

  // A first crawl stopped before it saved a page has nothing to show but that.
  const stoppedEmpty = progress.state === "cancelled" && !progress.hasPrevious;
  if (crawlLive || stoppedEmpty) {
    return <CrawlProgressView projectId={project.id} hostname={hostname} initial={progress} />;
  }

  const premium = account.plan !== "free";
  const inventory = await loadInventory(project, account.limits);
  const notCrawled = uncrawledPages(inventory, project.pages).length;
  const homepage = findHomepage(project.pages, project.rootUrl);
  const pageKeys = [...pageKeyIndex(project.pages).idByKey.keys()];
  if (premium) {
    await ensureSiteOpportunities(project);
  }

  const [audits, history, competitors, homepageAi, analysed, opportunities] = await Promise.all([
    homepage ? latestAudits(project.id, [keyOfPage(homepage)]) : [],
    getCrawlHistory(project.id, 10, project.latestCrawlId),
    // Competitors are paid; Free renders that panel locked, so there is
    // nothing to load for it.
    account.limits.maxCompetitors > 0
      ? prisma.competitor.findMany({
          where: { projectId: project.id, excluded: false },
          orderBy: [{ pinned: "desc" }, { confidence: "desc" }, { createdAt: "desc" }],
          take: 4,
        })
      : [],
    account.limits.ai && homepage ? getPageRecommendation(project.id, keyOfPage(homepage)) : null,
    account.limits.ai
      ? prisma.aiResult.findMany({
          where: {
            projectId: project.id,
            feature: "page-recommendation",
            status: "ok",
            pageKey: { in: pageKeys },
          },
          distinct: ["pageKey"],
          select: { pageKey: true },
        })
      : [],
    premium
      ? prisma.opportunity.findMany({
          where: { projectId: project.id, resolvedAt: null, status: { in: ["open", "in-progress"] } },
          orderBy: { score: "desc" },
          take: 4,
          select: { id: true, title: true, band: true, score: true, category: true, affectedCount: true },
        })
      : [],
  ]);

  const crawl = history.find((entry) => entry.id === project.latestCrawlId) ?? history[0] ?? null;
  const comparison = compareCrawls(history);

  const mobile = audits.find((audit) => audit.strategy === "mobile") ?? null;
  const desktop = audits.find((audit) => audit.strategy === "desktop") ?? null;

  const failedRecrawl = progress.state === "failed" && progress.hasPrevious ? progress : null;
  const stoppedRecrawl = progress.state === "cancelled" && progress.hasPrevious;
  // A first crawl stopped part way: its pages are what there is, so say so.
  const partial = crawl?.status === "cancelled" ? crawl : null;

  return (
    <>
    {failedRecrawl ? (
      <p role="alert" className="mb-4 rounded-xl bg-surface-soft px-4 py-3 text-sm leading-6 text-body ring-1 ring-bad/30">
        <span className="text-ink">The latest crawl stopped before it finished</span>
        {failedRecrawl.error ? ` (${failedRecrawl.error.slice(0, 160)})` : ""}. These are your previous results,
        unchanged.
      </p>
    ) : null}
    {stoppedRecrawl ? (
      <p role="status" className="mb-4 rounded-xl bg-surface-soft px-4 py-3 text-sm leading-6 text-body ring-1 ring-warn/30">
        <span className="text-ink">You stopped the latest crawl.</span> These are your previous results, unchanged.
      </p>
    ) : null}
    {partial ? (
      <p role="status" className="mb-4 rounded-xl bg-surface-soft px-4 py-3 text-sm leading-6 text-body ring-1 ring-warn/30">
        <span className="text-ink">
          You stopped this crawl after {partial.analyzed} {partial.analyzed === 1 ? "page" : "pages"}.
        </span>{" "}
        These results cover part of the site. Crawl again to cover all of it.
      </p>
    ) : null}
    <ProjectOverview
      project={project}
      plan={account.plan}
      planLabel={account.limits.label}
      maxPages={account.limits.maxPages}
      notCrawled={notCrawled}
      mobile={mobile}
      desktop={desktop}
      crawl={crawl}
      comparison={comparison}
      history={history}
      competitors={competitors}
      homepageAi={homepageAi}
      analysedPages={analysed.length}
      aiEnabled={aiConfigured()}
      opportunities={opportunities}
    />
    </>
  );
}
