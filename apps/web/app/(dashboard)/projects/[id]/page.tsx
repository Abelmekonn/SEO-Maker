import { compareCrawls } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";
import { notFound, redirect } from "next/navigation";
import { CrawlProgressView } from "@/components/project/CrawlProgressView";
import { ProjectOverview } from "@/components/project/ProjectOverview";
import { getCrawlProgress } from "@/lib/crawl-progress";
import { keyOfPage, latestAudits, pageKeyIndex } from "@/lib/page-results";
import { aiConfigured, getPageRecommendation } from "@/lib/ai-results";
import { getAccountForUser } from "@/lib/plan";
import { getCrawlHistory, getProjectForUser, requireUserId } from "@/lib/projects";
import { findHomepage, normalizeSiteUrl } from "@/lib/site-url";

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
  // A first crawl stopped before it saved a page has nothing to show but that.
  const stoppedEmpty = progress.state === "cancelled" && !progress.hasPrevious;
  if (progress.state === "queued" || progress.state === "running" || stoppedEmpty) {
    const parsed = normalizeSiteUrl(project.rootUrl);
    return (
      <CrawlProgressView
        projectId={project.id}
        hostname={"hostname" in parsed ? parsed.hostname : project.name}
        initial={progress}
      />
    );
  }

  const account = await getAccountForUser(userId);
  const premium = account.plan !== "free";
  const maxPages = Math.max(project.maxPages, account.limits.maxPages);
  const homepage = findHomepage(project.pages, project.rootUrl);
  const pageKeys = [...pageKeyIndex(project.pages).idByKey.keys()];

  const [audits, history, competitors, homepageAi, analysed] = await Promise.all([
    homepage ? latestAudits(project.id, [keyOfPage(homepage)]) : [],
    getCrawlHistory(project.id, 10, project.latestCrawlId),
    // AI and competitor panels are premium; Free renders them locked, so there
    // is nothing to load for it.
    premium
      ? prisma.competitor.findMany({
          where: { projectId: project.id, excluded: false },
          orderBy: [{ pinned: "desc" }, { confidence: "desc" }, { createdAt: "desc" }],
          take: 4,
        })
      : [],
    premium && homepage ? getPageRecommendation(project.id, keyOfPage(homepage)) : null,
    premium
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
      maxPages={maxPages}
      mobile={mobile}
      desktop={desktop}
      crawl={crawl}
      comparison={comparison}
      history={history}
      competitors={competitors}
      homepageAi={homepageAi}
      analysedPages={analysed.length}
      aiEnabled={aiConfigured()}
    />
    </>
  );
}
