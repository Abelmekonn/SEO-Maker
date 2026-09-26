import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight, History, Lock } from "lucide-react";
import { buildSiteContext, imageInputAvailable, linkTargetCount } from "@seo-maker/ai";
import {
  PAGE_AI_OUTPUTS,
  PAGE_OUTPUT_FEATURES,
  type PageAiOutput,
  fixPlanInputFromPage,
  pageOutputAvailability,
} from "@seo-maker/core/page";
import { AiRunButton } from "@/components/ai/AiRunButton";
import { AiWorkspaceHeader } from "@/components/ai/AiWorkspaceHeader";
import { PageOutputCard } from "@/components/ai/PageOutputCard";
import { TierBadge } from "@/components/ai/TierBadge";
import { UsageMeter } from "@/components/ai/UsageMeter";
import { AiQueueStatus } from "@/components/project/AiQueueStatus";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { PageTypeControl } from "@/components/project/PageTypeControl";
import { premiumGate } from "@/components/project/PremiumRoute";
import { PriorityFetchButton } from "@/components/project/PriorityFetchButton";
import { aiConfigured, getUserQuota, isHomepage } from "@/lib/ai-access";
import {
  type FeatureResult,
  friendlyAiError,
  getPageFeatureResults,
  getPageRecommendation,
  isFromEarlierCrawl,
} from "@/lib/ai-results";
import { hasAnyContext, readBusinessContext } from "@/lib/business-context";
import { keyOfPage } from "@/lib/page-results";
import { getAccountForUser } from "@/lib/plan";
import { getPageForUser, requireUserId } from "@/lib/projects";
import { getAiQueueJobs } from "@/lib/queue";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * Page AI for one page.
 *
 *   crawl evidence -> deterministic findings -> "Analyse this page" (why each
 *   problem matters, what to do) -> the outputs you ask for, one at a time
 *
 * Each output says whether this page has the evidence for it and, if not,
 * what would change that (a Priority fetch, a known page type). Nothing runs
 * until the user presses a button.
 */

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-bad/10 text-bad",
  medium: "bg-warn/15 text-warn",
  low: "bg-surface-card text-muted-foreground",
};

const OUTPUTS = PAGE_AI_OUTPUTS.filter((output) => output !== "analysis");

export default async function PageAiWorkspace({ params }: { params: Promise<{ id: string; pageId: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { id, pageId } = await params;
  const page = await getPageForUser(id, pageId, userId);
  if (!page) notFound();

  const gate = await premiumGate(id, "suggestions");
  if (gate) return gate;

  const project = page.project;
  const account = await getAccountForUser(userId);
  const home = isHomepage(page, project.rootUrl);
  const path = pagePath(page.finalUrl ?? page.url);
  const endpoint = `/api/projects/${id}/analyze`;

  const pageKey = keyOfPage(page);
  const [recommendation, features, site, quota, jobs] = await Promise.all([
    getPageRecommendation(id, pageKey),
    getPageFeatureResults(id, pageKey),
    buildSiteContext(id),
    getUserQuota(userId, account.limits),
    getAiQueueJobs(id).catch(() => []),
  ]);

  const fixInput = fixPlanInputFromPage(page, site ? linkTargetCount(site, page.finalUrl ?? page.url) : 0, {
    imageInput: imageInputAvailable("image-alt"),
  });
  const availability = pageOutputAvailability(fixInput);

  // What is queued for this page, by output. A job with no feature list is a
  // full analysis, which also writes the fixes the plan routes to AI.
  const mine = jobs.filter((job) => job.pageId === page.id);
  const queuedFeatures = new Set(mine.flatMap((job) => job.features ?? ["page-recommendation"]));
  const isQueued = (output: PageAiOutput) => PAGE_OUTPUT_FEATURES[output].some((feature) => queuedFeatures.has(feature));

  const homeOnly = account.limits.aiHomepageOnly && !home;
  const blockedReason = !aiConfigured() ? "AI is not available right now. Try again later." : undefined;
  const standardWithoutText = page.crawlTier === "standard" && !page.content;
  const fetching = page.status === "crawling";
  const business = hasAnyContext(readBusinessContext(project));
  const earlier = recommendation?.data && isFromEarlierCrawl(recommendation, page) ? recommendation.createdAt : null;
  const failing = new Set(page.issues.map((issue) => issue.checkId));

  const resultsFor = (output: PageAiOutput): FeatureResult[] =>
    PAGE_OUTPUT_FEATURES[output].flatMap((feature) => {
      const result = features.get(feature);
      return result ? [result] : [];
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <CrawlRefresh status={fetching ? "crawling" : "idle"} intervalMs={3000} />
      <Link
        href={`/projects/${id}/ai/pages`}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-md font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All pages
      </Link>

      <AiWorkspaceHeader
        projectId={id}
        siteName={project.name}
        active="pages"
        limits={account.limits}
        title={path}
        description="Ask for what this page needs. Each output is written from the page's own crawl evidence and the SEO knowledge base, and runs only when you press its button."
        businessContext={business}
      />

      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tier={page.crawlTier} />
        {home ? <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] text-body">Homepage</span> : null}
        {page.pageType ? (
          <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] text-body">{page.pageType}</span>
        ) : null}
        {page.wordCount != null ? (
          <span className="font-mono text-[11px] text-muted-foreground">{page.wordCount.toLocaleString()} words</span>
        ) : null}
        <Link href={`/projects/${id}/pages/${page.id}`} className="ml-auto inline-flex items-center gap-1 font-mono text-[12px] text-body hover:text-ink">
          Page checks
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
        <a
          href={page.finalUrl ?? page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[12px] text-body hover:text-ink"
        >
          Live page
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      </div>

      {homeOnly ? (
        <section className="flex flex-col items-start gap-3 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
          <span className="flex size-8 items-center justify-center rounded-full bg-surface-card">
            <Lock className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <h2 className="font-display text-[18px] text-ink">AI on this page is part of Pro and Agency</h2>
          <p className="max-w-xl text-sm leading-6 text-body">
            {account.limits.label} includes Page AI for your homepage. Upgrade to analyse every page of your site, with no
            daily cap.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground hover:bg-primary-active"
            >
              See plans
            </Link>
            <Link href={`/projects/${id}/ai/pages`} className="inline-flex h-11 items-center rounded-md px-4 font-mono text-sm text-ink ring-1 ring-hairline hover:bg-surface-card">
              Back to your homepage
            </Link>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
          <div className="flex min-w-0 flex-col gap-4">
            <AiQueueStatus projectId={id} pageId={page.id} />

            {standardWithoutText || fetching ? (
              <section className="flex flex-col items-start gap-3 rounded-xl bg-primary/5 p-5 ring-1 ring-primary/30">
                <h2 className="font-display text-[17px] text-ink">
                  {fetching ? "Fetching the full page" : "This is a Standard page"}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-body">
                  {fetching
                    ? "Its text, images and structured data are being collected. This screen updates when they arrive."
                    : "The crawl kept its counts and links, not its text, so most outputs have nothing to write from yet. Make it a Priority page to fetch its full content now; later crawls keep it Priority."}
                </p>
                {page.error && !fetching ? <p className="text-sm text-warn">{page.error}</p> : null}
                {!fetching ? <PriorityFetchButton projectId={id} pageId={page.id} label="Make Priority and fetch" appearance="primary" /> : null}
              </section>
            ) : null}

            {/* Problem identification */}
            <section aria-labelledby="analysis" className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex max-w-xl flex-col gap-1">
                  <h2 id="analysis" className="font-display text-[20px] leading-7 tracking-[-0.3px] text-ink">
                    Analyse this page
                  </h2>
                  <p className="text-sm leading-6 text-body">
                    {page.issues.length
                      ? `The crawl found ${page.issues.length} ${page.issues.length === 1 ? "problem" : "problems"} here. AI explains each one: why it matters and what to do.`
                      : "Every check passes on this page. You can still ask for any output below."}
                  </p>
                </div>
                {isQueued("analysis") ? null : availability.analysis.available ? (
                  <AiRunButton
                    endpoint={endpoint}
                    body={{ pageId: page.id, outputs: ["analysis"] }}
                    label={recommendation?.data ? "Re-analyse" : "Analyse this page"}
                    regenerate={Boolean(recommendation?.data)}
                    appearance="primary"
                    disabledReason={blockedReason}
                  />
                ) : null}
              </div>

              {earlier ? (
                <p className="flex items-start gap-2 rounded-md bg-surface-card px-3 py-2 text-xs leading-5 text-body">
                  <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  Written for the crawl of {earlier.toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Re-analyse to
                  explain this crawl.
                </p>
              ) : null}

              {recommendation && !recommendation.data ? (
                <p className="text-sm text-bad">{friendlyAiError(recommendation.error)}</p>
              ) : null}

              {recommendation?.data ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-6 text-ink">{recommendation.data.summary}</p>
                  <ul className="flex flex-col gap-2">
                    {recommendation.data.recommendations.map((row) => (
                      <li
                        key={row.checkId}
                        className={cn("flex flex-col gap-1.5 rounded-lg bg-canvas p-4 ring-1 ring-hairline", !failing.has(row.checkId) && "opacity-60")}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-ink">{row.issue}</p>
                          <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px]", SEVERITY_STYLE[row.severity] ?? SEVERITY_STYLE.low)}>
                            {row.severity}
                          </span>
                          {!failing.has(row.checkId) ? <span className="font-mono text-[11px] text-good">fixed since</span> : null}
                          {!row.actionable ? <span className="font-mono text-[11px] text-muted-foreground">needs more evidence</span> : null}
                        </div>
                        <p className="text-sm leading-6 text-body">{row.whyItMatters}</p>
                        <p className="text-sm leading-6 text-ink">
                          <span className="font-mono text-[12px] text-muted-foreground">Do: </span>
                          {row.action}
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    AI-written · {recommendation.data.confidence} confidence · grounded in {recommendation.data.groundedIn.length} sources
                    {recommendation.data.needsHumanReview ? " · check before acting" : ""}
                  </p>
                </div>
              ) : !recommendation && page.issues.length ? (
                <p className="rounded-lg border border-dashed border-hairline px-4 py-3 text-sm text-body">
                  Not analysed yet. The problems themselves are on the page checks; the analysis adds why each matters and what to do.
                </p>
              ) : null}
            </section>

            <h2 className="mt-2 font-display text-[20px] leading-7 tracking-[-0.3px] text-ink">Recommendations</h2>
            <div className="grid gap-4 2xl:grid-cols-2">
              {OUTPUTS.map((output) => (
                <PageOutputCard
                  key={output}
                  output={output}
                  endpoint={endpoint}
                  pageId={page.id}
                  availability={availability[output]}
                  results={resultsFor(output)}
                  queued={isQueued(output)}
                  blockedReason={blockedReason}
                  remedy={
                    output === "schema" ? (
                      <PageTypeControl
                        projectId={id}
                        pageId={page.id}
                        current={page.pageType}
                        prompt="Say what this page is, and structured data can be written for it."
                      />
                    ) : undefined
                  }
                />
              ))}
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <UsageMeter quota={quota} planLabel={account.limits.label} />
            <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline">
              <p className="text-sm font-medium text-ink">What AI can and cannot do here</p>
              <ul className="flex flex-col gap-1.5 text-xs leading-5 text-body">
                <li>It writes only from this page&apos;s crawl evidence and the knowledge base, never from guesses about your business.</li>
                <li>It does not know your rankings, traffic or whether Google has indexed the page.</li>
                <li>Suggestions that need evidence the crawl lacks are withheld, and say why.</li>
                <li>Add business context in settings for recommendations specific to your business.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
