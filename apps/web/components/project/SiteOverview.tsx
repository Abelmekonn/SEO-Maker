import type { ReactNode } from "react";
import type { Competitor, Crawl, Page, PerformanceAudit, Project } from "@seo-maker/db";
import Link from "next/link";
import {
  Activity,
  ArrowUp,
  CircleDot,
  Crosshair,
  Lightbulb,
  Sparkles,
  Swords,
  Workflow,
} from "lucide-react";
import { DonutChart, ScoreSpark, TrendLines } from "@/components/project/OverviewCharts";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import {
  AiAssistantCard,
  CompetitorCard,
  KeyInsightsCard,
  NextActions,
  groupFindings,
} from "@/components/project/OverviewInsights";
import { OverviewPageTable } from "@/components/project/OverviewPageTable";
import { OverviewProblems } from "@/components/project/OverviewProblems";
import { LockedCard } from "@/components/project/PremiumGate";
import { RecrawlButton } from "@/components/project/RecrawlButton";
import { ScoreRing } from "@/components/project/ScoreRing";
import { StatusBadge } from "@/components/project/StatusBadge";
import type { PageAiResult } from "@/lib/ai-results";
import {
  isCrawled,
  onPageCheckIds,
  pageHealth,
  siteCategoryScore,
  siteSeoScore,
  technicalCheckIds,
} from "@/lib/page-audit";
import type { PlanId } from "@/lib/plan";
import { findHomepage, normalizeSiteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";

const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

export function SiteOverview({
  project,
  plan,
  planLabel,
  maxPages,
  mobile,
  desktop,
  history,
  competitors,
  homepageAi,
  analysedPages,
  aiEnabled,
}: {
  project: Project & { pages: Page[] };
  plan: PlanId;
  planLabel: string;
  maxPages: number;
  mobile: PerformanceAudit | null;
  desktop: PerformanceAudit | null;
  /** Finished crawls, newest first. Scores are snapshotted on each row. */
  history: Crawl[];
  competitors: Competitor[];
  homepageAi: PageAiResult | null;
  analysedPages: number;
  aiEnabled: boolean;
}) {
  const homepage = findHomepage(project.pages, project.rootUrl);
  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const premium = plan !== "free";

  // Free audits the homepage only; premium audits every crawled page.
  const scopePages = premium ? project.pages : homepage ? [homepage] : [];
  const crawledPages = scopePages.filter(isCrawled);
  const homepagePerf = mobile?.performance ?? desktop?.performance ?? null;
  const scores = {
    overall: siteSeoScore(scopePages),
    technical: siteCategoryScore(scopePages, technicalCheckIds),
    onPage: siteCategoryScore(scopePages, onPageCheckIds),
    performance: homepagePerf == null ? null : Math.round(homepagePerf),
  };
  const lastCrawl = scopePages.reduce<Date | null>(
    (latest, page) =>
      !latest || page.createdAt > latest ? page.createdAt : latest,
    null,
  );
  // Oldest first for charts. Every point is a stored crawl snapshot, not sample data.
  const timeline = [...history].reverse().filter((crawl) => crawl.seoScore != null);
  const series = (key: "seoScore" | "technicalScore" | "onPageScore") =>
    timeline.map((crawl) => (crawl[key] == null ? null : Math.round(crawl[key] as number)));
  const groups = premium ? groupFindings(scopePages) : [];
  const health = { optimized: 0, issues: 0, warnings: 0, critical: 0 };
  for (const page of crawledPages) {
    const verdict = pageHealth(page);
    if (verdict !== "pending") {
      health[verdict] += 1;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <CrawlRefresh status={project.status} />
      <CrawlRefresh status={project.perfStatus} intervalMs={3000} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <SiteMark hostname={hostname} />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-mono text-[12px] text-muted-foreground">
              Projects / {hostname}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
                {hostname}
              </h1>
              <StatusBadge status={project.status} />
              <span className="inline-flex rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] leading-4 text-ink">
                {planLabel}
              </span>
            </div>
            <p className="text-sm leading-6 text-body">
              {lastCrawl
                ? `Last crawled ${formatRelative(lastCrawl)}. `
                : "Not crawled yet. "}
              {premium
                ? `${crawledPages.length} ${crawledPages.length === 1 ? "page" : "pages"} analyzed.`
                : "Free plan checks your homepage."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RecrawlButton
            projectId={project.id}
            maxPages={maxPages}
            appearance="primary"
          />
        </div>
      </header>

      {project.status === "failed" ? (
        <p
          role="alert"
          className="rounded-xl bg-surface-soft px-5 py-4 text-sm leading-6 text-ink ring-1 ring-bad/40"
        >
          The last crawl failed. Run it again, or check that Redis and the
          worker are up.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-label="Scores"
            className="grid grid-cols-2 gap-3 xl:grid-cols-4"
          >
            <ScoreCard
              label="Overall SEO score"
              icon={Crosshair}
              score={scores.overall}
              spark={premium ? series("seoScore") : []}
              sparkLabel="Overall SEO trend"
              ring
            />
            <ScoreCard
              label="Technical SEO"
              icon={CircleDot}
              score={scores.technical}
              spark={premium ? series("technicalScore") : []}
              sparkLabel="Technical SEO trend"
              sparkClass="text-primary"
            />
            <ScoreCard
              label="On-page SEO"
              icon={Workflow}
              score={scores.onPage}
              spark={premium ? series("onPageScore") : []}
              sparkLabel="On-page SEO trend"
              sparkClass="text-ink"
            />
            <ScoreCard
              label="Performance"
              icon={Activity}
              score={scores.performance}
              spark={[]}
              sparkLabel="Performance trend"
              sparkClass="text-good"
              href={`/projects/${project.id}/performance`}
            />
          </section>

          {premium ? (
            <section
              aria-label="Site charts"
              className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
            >
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
                      Score history
                    </h2>
                    <p className="font-mono text-[12px] text-muted-foreground">
                      {timeline.length === 0
                        ? "No finished crawl yet"
                        : `${timeline.length} ${timeline.length === 1 ? "crawl" : "crawls"} since ${shortDate.format(timeline[0].startedAt)}`}
                    </p>
                  </div>
                  <ul className="flex flex-wrap items-center gap-4 font-mono text-[12px] text-body">
                    <LegendDot className="bg-[#8b7cf6]" label="SEO score" />
                    <LegendDot className="bg-[#2dd4bf]" label="Technical" />
                    <LegendDot className="bg-good" label="On-page" />
                  </ul>
                </div>
                {timeline.length >= 2 ? (
                  <TrendLines
                    label={`SEO, technical and on-page scores across ${timeline.length} crawls`}
                    ticks={timeline.map((crawl) => shortDate.format(crawl.startedAt))}
                    series={[
                      { key: "seo", label: "SEO score", values: series("seoScore"), color: "#8b7cf6" },
                      { key: "tech", label: "Technical", values: series("technicalScore"), color: "#2dd4bf" },
                      { key: "onpage", label: "On-page", values: series("onPageScore"), color: "#3ecf8e" },
                    ]}
                  />
                ) : (
                  <p className="flex min-h-40 items-center text-sm leading-6 text-body">
                    The trend appears after your next crawl, so you can see whether your fixes moved
                    the score. Re-crawl once you have made changes.
                  </p>
                )}
              </Card>

              <Card>
                <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
                  Page health
                </h2>
                <DonutChart
                  label={`${health.optimized} healthy, ${health.issues} issues, ${health.warnings} warnings, ${health.critical} critical`}
                  center={`${crawledPages.length}`}
                  segments={[
                    {
                      key: "healthy",
                      label: "Healthy",
                      value: health.optimized,
                      color: "#3ecf8e",
                    },
                    {
                      key: "issues",
                      label: "Issues",
                      value: health.issues,
                      color: "#f2b84b",
                    },
                    {
                      key: "warnings",
                      label: "Warnings",
                      value: health.warnings,
                      color: "#ff6d29",
                    },
                    {
                      key: "critical",
                      label: "Critical",
                      value: health.critical,
                      color: "#f87171",
                    },
                  ]}
                />
              </Card>
            </section>
          ) : null}

          <OverviewProblems
            pages={scopePages}
            projectId={project.id}
            detailed={premium}
          />

          <section
            aria-label="Page analysis"
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <OverviewPageTable
              pages={scopePages}
              projectId={project.id}
              homepageId={homepage?.id ?? null}
              homepagePerf={scores.performance}
            />
          </section>

          {premium ? <NextActions projectId={project.id} groups={groups} /> : null}
        </div>

        {premium ? (
          <aside className="flex flex-col gap-4">
            <AiAssistantCard
              projectId={project.id}
              homepageId={homepage?.id ?? null}
              result={homepageAi}
              analysedPages={analysedPages}
              totalPages={crawledPages.length}
              aiEnabled={aiEnabled}
            />
            <CompetitorCard projectId={project.id} competitors={competitors} />
            <KeyInsightsCard
              projectId={project.id}
              groups={groups}
              crawledCount={crawledPages.length}
              crawl={history[0] ?? null}
              performance={homepagePerf}
            />
          </aside>
        ) : (
          <aside className="flex flex-col gap-4">
            <LockedCard
              title="AI Assistant"
              icon={<Sparkles className="size-4 text-primary" aria-hidden />}
              body="Get a plain-language explanation of each problem and a drafted fix, grounded in your pages."
              preview={<SkeletonLines rows={5} />}
            />
            <LockedCard
              title="Competitor analysis"
              icon={<Swords className="size-4 text-body" aria-hidden />}
              body="See who ranks for your queries and where their pages beat yours."
              preview={<SkeletonRows rows={4} />}
            />
            <LockedCard
              title="Key insights"
              icon={<Lightbulb className="size-4 text-body" aria-hidden />}
              body="Prioritized insights across your whole site, not just the homepage."
              preview={<SkeletonRows rows={3} />}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

/** Neutral shapes behind a locked card, so no sample numbers are shown. */
function SkeletonLines({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, index) => (
        <span
          key={index}
          className="h-3 rounded bg-surface-card"
          style={{ width: `${92 - ((index * 17) % 40)}%` }}
        />
      ))}
      <span className="mt-2 h-11 rounded-md bg-surface-card" />
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="size-8 shrink-0 rounded-lg bg-surface-card" />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="h-3 w-3/4 rounded bg-surface-card" />
            <span className="h-2.5 w-1/2 rounded bg-surface-card" />
          </div>
          <span className="h-3 w-8 rounded bg-surface-card" />
        </div>
      ))}
    </div>
  );
}

function formatRelative(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function ScoreCard({
  label,
  icon: Icon,
  score,
  delta,
  hint,
  spark,
  sparkLabel,
  sparkClass,
  href,
  ring,
}: {
  label: string;
  icon: typeof Crosshair;
  score: number | null;
  delta?: number;
  hint?: string;
  spark: Array<number | null | undefined>;
  sparkLabel: string;
  sparkClass?: string;
  href?: string;
  ring?: boolean;
}) {
  const body = (
    <>
      <p className="flex items-center gap-2 font-mono text-[12px] text-muted-foreground">
        <span className="flex size-5 items-center justify-center rounded-full bg-surface-card">
          <Icon className="size-3" aria-hidden />
        </span>
        {label}
      </p>
      {ring ? (
        <div className="flex items-center gap-4">
          <ScoreRing
            score={score}
            size={88}
            strokeWidth={8}
            label={label}
            centerValue
            stackValue
            tone="good"
          />
          <Delta value={delta} hint={hint} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-[32px] leading-none tracking-[-0.6px] tabular-nums text-ink">
              {score == null ? "-" : score}
              <span className="text-[16px] text-muted-foreground">/100</span>
            </p>
            <Delta value={delta} />
          </div>
          <ScoreSpark
            values={spark}
            label={sparkLabel}
            className={sparkClass}
            fit
          />
        </div>
      )}
    </>
  );

  const className =
    "flex min-h-[148px] flex-col justify-between gap-4 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          className,
          "hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function Delta({ value, hint }: { value?: number; hint?: string }) {
  if (value == null) {
    return null;
  }
  return (
    <div className="flex flex-col gap-0.5">
      <p className="inline-flex items-center gap-0.5 font-mono text-[12px] tabular-nums text-good">
        <ArrowUp className="size-3" aria-hidden />
        {value}
      </p>
      {hint ? (
        <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      {children}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-1.5 rounded-full", className)} />
      {label}
    </li>
  );
}

function SiteMark({ hostname }: { hostname: string }) {
  return (
    <span className="relative mt-5 flex size-10 shrink-0 overflow-hidden rounded-lg bg-surface-soft ring-1 ring-hairline">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
        alt=""
        width={40}
        height={40}
        className="size-full object-contain p-1.5"
      />
    </span>
  );
}
