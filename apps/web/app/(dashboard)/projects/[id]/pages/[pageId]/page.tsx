import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { buildSiteContext, imageInputAvailable, linkTargetCount } from "@seo-maker/ai";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/shell";
import { fixPlanInputFromPage, planFixes } from "@seo-maker/core/page";
import { AiQueueStatus } from "@/components/project/AiQueueStatus";
import { CrawlPageButton } from "@/components/project/CrawlPageButton";
import { PageInspector } from "@/components/project/PageInspector";
import { PremiumPage } from "@/components/project/PremiumGate";
import { PriorityFetchButton } from "@/components/project/PriorityFetchButton";
import { TierBadge } from "@/components/ai/TierBadge";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { isHomepage } from "@/lib/ai-access";
import { StatusBadge } from "@/components/project/StatusBadge";
import { aiConfigured, getPageFeatureResults, getPageRecommendation, isFromEarlierCrawl } from "@/lib/ai-results";
import { analysisScope } from "@/lib/analysis-scope";
import { isCrawled } from "@/lib/page-audit";
import { type PageAnalysis, inspectPage } from "@/lib/page-inspector";
import { keyOfPage } from "@/lib/page-results";
import { getAccountForUser } from "@/lib/plan";
import { getPageForUser, latestPages, requireUserId } from "@/lib/projects";
import { getCrawlPageJobs } from "@/lib/queue";
import { pagePath } from "@/lib/site-url";

export default async function ProjectPageDetailPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id, pageId } = await params;
  const page = await getPageForUser(id, pageId, userId);

  if (!page) {
    notFound();
  }

  // Read by URL, so an analysis from before the last crawl still shows.
  const pageKey = keyOfPage(page);
  const [recommendation, features, account, site, queued] = await Promise.all([
    getPageRecommendation(page.projectId, pageKey),
    getPageFeatureResults(page.projectId, pageKey),
    getAccountForUser(userId),
    buildSiteContext(page.projectId),
    getCrawlPageJobs(page.projectId).catch(() => [] as string[]),
  ]);
  // Link targets and image evidence counted exactly as the worker counts
  // them, so this list and the AI Workspace never disagree.
  const plan = planFixes(
    fixPlanInputFromPage(page, site ? linkTargetCount(site, page.finalUrl ?? page.url) : 0, {
      imageInput: imageInputAvailable("image-alt"),
    }),
  );

  const liveUrl = page.finalUrl ?? page.url;
  const home = isHomepage(page, page.project.rootUrl);
  const aiHere = account.limits.ai && (!account.limits.aiHomepageOnly || home);
  // "Crawl Page" or a Priority fetch waiting for, or running on, this page.
  const fetching = page.status === "crawling" || queued.includes(page.id);

  // A plan that analyzes Priority pages only (Free: the homepage) shows those
  // in full. Older crawls, made on a plan since lapsed, can hold more pages.
  if (!account.limits.analyzeStandardPages) {
    const scope = analysisScope(await latestPages(page.project), page.project.rootUrl, account.limits);
    if (!scope.some((entry) => entry.id === page.id)) {
      return (
        <PremiumPage
          projectId={id}
          title="Analyze more of your site"
          body={`${account.limits.label} analyzes your homepage in full. This page is from a crawl made on another plan. Pro and Agency check every crawled page and show the exact error on each.`}
          unlocks={[
            "Every crawled page, up to your plan's page count",
            "Exact evidence and a fix for each problem",
            "AI explanations grounded in your pages",
          ]}
        />
      );
    }
  }

  // An explanation written for an earlier crawl: say so, and count the
  // problems it covered that this crawl no longer finds.
  const failing = new Set(page.issues.map((issue) => issue.checkId));
  const analysis: PageAnalysis | null = recommendation?.data
    ? {
        summary: recommendation.data.summary,
        confidence: recommendation.data.confidence,
        needsHumanReview: recommendation.data.needsHumanReview,
        groundedIn: recommendation.data.groundedIn,
        createdAt: recommendation.createdAt.toISOString(),
        mode: recommendation.mode,
        knowledgeVersion: recommendation.knowledgeVersion,
        earlier: isFromEarlierCrawl(recommendation, page)
          ? {
              at: recommendation.createdAt.toISOString(),
              fixed: recommendation.data.recommendations.filter((item) => !failing.has(item.checkId)).length,
            }
          : null,
      }
    : null;

  const checks = inspectPage({
    page,
    plan,
    recommendation: recommendation?.data ?? null,
    features,
    aiAllowed: aiHere && aiConfigured(),
  });

  const facts = [
    { label: "Requested URL", value: page.url },
    ...(page.finalUrl && page.finalUrl !== page.url ? [{ label: "Final URL", value: page.finalUrl }] : []),
    { label: "Status", value: page.statusCode == null ? "-" : String(page.statusCode) },
    { label: "HTTPS", value: page.isHttps == null ? "-" : page.isHttps ? "Yes" : "No" },
    ...(page.responseTimeMs != null ? [{ label: "Response", value: `${page.responseTimeMs} ms` }] : []),
    ...(page.pageType ? [{ label: "Page type", value: page.pageType }] : []),
    { label: "Crawled", value: page.createdAt.toLocaleDateString() },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <Link
        href={`/projects/${id}/pages`}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-md font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All pages
      </Link>
      <PageHeader
        title={pagePath(liveUrl)}
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <p className="break-all font-mono text-sm text-body">{liveUrl}</p>
            <StatusBadge status={page.status} />
            <TierBadge tier={page.crawlTier} />
            {page.pageType ? (
              <Inferred label="Type" value={page.pageType} confidence={page.pageTypeScore} />
            ) : null}
            {page.searchIntent ? (
              <Inferred label="Intent" value={page.searchIntent} confidence={page.searchIntentScore} />
            ) : null}
          </div>
        }
        description={`${page.project.name}. Everything the crawler checked on this page: what needs attention, the fix as code, and what already passes.`}
        actions={
          <>
            <Button asChild variant="outline" className="h-11 w-fit">
              <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                Open live page
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
            {aiHere ? (
              <Button asChild variant="outline" className="h-11 w-fit">
                <Link href={`/projects/${id}/ai/pages/${page.id}`}>
                  <Sparkles aria-hidden />
                  AI Workspace
                </Link>
              </Button>
            ) : null}
            <CrawlPageButton projectId={id} pageId={page.id} busy={fetching} />
          </>
        }
      />
      <CrawlRefresh status={fetching ? "crawling" : "idle"} intervalMs={3000} />
      {page.crawlTier === "standard" && !page.content ? (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <div className="flex max-w-2xl flex-col gap-1">
            <p className="text-sm font-medium text-ink">
              {fetching ? "Fetching the page" : "Standard page: its counts and links were crawled, not its text"}
            </p>
            <p className="text-sm leading-6 text-body">
              {fetching
                ? "This page updates when the fetch finishes."
                : "Make it a Priority page to fetch its full content now. Every check then has its evidence, and AI fixes can use the text."}
            </p>
            {page.error && !fetching ? <p className="text-sm text-warn">{page.error}</p> : null}
          </div>
          {!fetching ? <PriorityFetchButton projectId={id} pageId={page.id} label="Make Priority and fetch" /> : null}
        </section>
      ) : page.error && !fetching ? (
        <p role="status" className="rounded-xl bg-surface-soft px-5 py-4 text-sm leading-6 text-warn ring-1 ring-warn/30">
          The last attempt to crawl this page did not finish: {page.error}
        </p>
      ) : null}
      {aiHere ? <AiQueueStatus projectId={id} pageId={page.id} /> : null}
      <PageInspector
        projectId={id}
        pageId={page.id}
        pageType={page.pageType}
        checks={checks}
        analysis={analysis}
        crawled={isCrawled(page)}
        aiAllowed={aiHere}
        aiEnabled={aiConfigured()}
        planLabel={account.limits.label}
        facts={facts}
      />
    </div>
  );
}

/** A classification the crawler inferred, shown with how sure it is. */
function Inferred({ label, value, confidence }: { label: string; value: string; confidence: number | null }) {
  const pct = confidence == null ? null : Math.round(confidence * 100);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] leading-4 text-body"
      title={pct == null ? undefined : `Inferred from the page, ${pct}% confidence`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="text-ink">{value}</span>
      {pct != null ? <span className={pct < 50 ? "text-warn" : "text-muted-foreground"}>{pct}%</span> : null}
    </span>
  );
}
