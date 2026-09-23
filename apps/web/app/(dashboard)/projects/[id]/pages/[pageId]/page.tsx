import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/shell";
import { fixPlanInputFromPage, planFixes } from "@seo-maker/core/page";
import { prisma } from "@seo-maker/db";
import { AiQueueStatus } from "@/components/project/AiQueueStatus";
import { AiRecommendations } from "@/components/project/AiRecommendations";
import { PageChecks } from "@/components/project/PageChecks";
import { PageEvidencePanel } from "@/components/project/PageEvidence";
import { PageFixes } from "@/components/project/PageFixes";
import { PremiumPage } from "@/components/project/PremiumGate";
import { RecrawlButton } from "@/components/project/RecrawlButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import { aiConfigured, getPageFeatureResults, getPageRecommendation } from "@/lib/ai-results";
import { getAccountForUser } from "@/lib/plan";
import { getPageForUser, latestPages, requireUserId } from "@/lib/projects";
import { findHomepage, pagePath } from "@/lib/site-url";

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

  const [recommendation, features, account, knownUrlCount] = await Promise.all([
    getPageRecommendation(page.id),
    getPageFeatureResults(page.id),
    getAccountForUser(userId),
    // The other crawled pages are the only valid internal-link targets, so the
    // fix plan counts them the same way the worker does.
    prisma.page.count({
      where: { crawlId: page.crawlId, status: "analyzed", NOT: { id: page.id } },
    }),
  ]);
  const plan = planFixes(fixPlanInputFromPage(page, knownUrlCount));
  const liveUrl = page.finalUrl ?? page.url;
  const premium = account.plan !== "free";

  // Free covers the homepage only. Older crawls can still hold other pages.
  if (!premium) {
    const homepage = findHomepage(await latestPages(page.project), page.project.rootUrl);
    if (homepage && homepage.id !== page.id) {
      return (
        <PremiumPage
          projectId={id}
          title="More than your homepage"
          body="Free checks your homepage. Premium checks the rest of your site and shows the exact error on every page."
          unlocks={[
            "Every crawled page, up to your plan's page count",
            "Exact evidence and a fix for each problem",
            "AI explanations grounded in your pages",
          ]}
        />
      );
    }
  }

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
            {page.pageType ? (
              <Inferred label="Type" value={page.pageType} confidence={page.pageTypeScore} />
            ) : null}
            {page.searchIntent ? (
              <Inferred label="Intent" value={page.searchIntent} confidence={page.searchIntentScore} />
            ) : null}
          </div>
        }
        description={`${page.project.name}. Every check the crawler ran on this page, failing ones first.`}
        actions={
          <>
            <Button asChild variant="outline" className="h-11 w-fit">
              <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                Open live page
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
            <RecrawlButton projectId={id} maxPages={page.project.maxPages} />
          </>
        }
      />
      <PageChecks page={page} detailed={premium} />
      <AiRecommendations
        result={recommendation}
        projectId={id}
        pageId={page.id}
        aiEnabled={aiConfigured()}
        planAllowsAi={account.limits.ai}
        planLabel={account.limits.label}
        status={<AiQueueStatus projectId={id} pageId={page.id} />}
      >
        <PageFixes
          projectId={id}
          pageId={page.id}
          pageType={page.pageType}
          plan={plan}
          issues={page.issues}
          recommendation={recommendation?.data ?? null}
          features={features}
        />
      </AiRecommendations>
      {premium ? <PageEvidencePanel page={page} /> : null}
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
