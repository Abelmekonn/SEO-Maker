import type { ReactNode } from "react";
import type { Page, PerformanceAudit, Project } from "@seo-maker/db";
import Link from "next/link";
import { ExternalLink, LoaderCircle } from "lucide-react";
import {
  ProgressBar,
  ScoreSpark,
  SegmentBar,
  SemiGauge,
} from "@/components/project/OverviewCharts";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { RecrawlButton } from "@/components/project/RecrawlButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  checks,
  checkValue,
  failedChecks,
  failsCheck,
  isCrawled,
  pageAuditStats,
  THIN_WORD_LIMIT,
} from "@/lib/page-audit";
import { PERF_ACTIVE, scoreRating, type Rating } from "@/lib/performance";
import { cn } from "@/lib/utils";

const ratingText: Record<Rating, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-ink",
};

type ProjectWithPages = Project & { pages: Page[] };

export function ProjectOverview({
  project,
  mobile,
  desktop,
}: {
  project: ProjectWithPages;
  mobile: PerformanceAudit | null;
  desktop: PerformanceAudit | null;
}) {
  const homepage = project.pages[0] ?? null;
  const stats = pageAuditStats(project.pages);
  const crawling = stats.pending > 0;
  const perfActive = PERF_ACTIVE.has(project.perfStatus);
  const crawled = Boolean(homepage && isCrawled(homepage));
  const issues = homepage && crawled ? failedChecks(homepage) : [];
  const passingChecks = crawled ? checks.length - issues.length : 0;
  const checkPct = crawled ? Math.round((passingChecks / checks.length) * 100) : 0;
  const mobileScore = mobile?.performance ?? null;
  const desktopScore = desktop?.performance ?? null;
  const words = homepage?.wordCount ?? null;
  const host = hostnameOf(project.rootUrl);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <CrawlRefresh status={project.status} />
      <CrawlRefresh status={project.perfStatus} intervalMs={3000} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[28px] leading-[1.2] tracking-[-0.5px] text-ink">
              {project.name}
              <span className="text-body"> | Overview</span>
            </h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="font-mono text-sm break-all text-muted-foreground">{host}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <Button asChild variant="outline" className="h-11 w-fit">
            <Link href={`/projects/${project.id}/pages`}>Open pages</Link>
          </Button>
          <RecrawlButton projectId={project.id} />
        </div>
      </header>

      {project.status === "failed" ? (
        <p role="alert" className="rounded-lg bg-surface-soft px-5 py-4 text-sm leading-6 text-ink ring-1 ring-bad/40">
          The homepage crawl failed. Run it again, or check that Redis and the worker are up.
        </p>
      ) : null}

      <section aria-label="Scores" className="grid gap-4 lg:grid-cols-3">
        <Card className={perfActive ? "ring-primary/40" : undefined}>
          <div className="flex items-end justify-center gap-8 py-1">
            {perfActive && mobileScore == null ? (
              <ChartPending label="Mobile" />
            ) : (
              <SemiGauge
                label="Mobile"
                value={mobileScore}
                rating={scoreRating(mobileScore)}
              />
            )}
            {perfActive && desktopScore == null ? (
              <ChartPending label="Desktop" />
            ) : (
              <SemiGauge
                label="Desktop"
                value={desktopScore}
                rating={scoreRating(desktopScore)}
              />
            )}
          </div>
        </Card>

        <Card>
          <MetricHead
            label="Words"
            value={crawling ? null : words}
            hint={
              crawling
                ? "Parsing the homepage"
                : words == null
                  ? "Fills after the crawl"
                  : words < THIN_WORD_LIMIT
                    ? `Under ${THIN_WORD_LIMIT} reads as thin`
                    : `At least ${THIN_WORD_LIMIT} words`
            }
            loading={crawling}
          />
          <ProgressBar
            value={words ?? 0}
            max={Math.max(THIN_WORD_LIMIT, words ?? THIN_WORD_LIMIT)}
            rating={words == null ? "none" : words < THIN_WORD_LIMIT ? "warn" : "good"}
            label={
              words == null
                ? "No word count yet"
                : `${words} words, target ${THIN_WORD_LIMIT}`
            }
            accent={words != null && words >= THIN_WORD_LIMIT}
          />
        </Card>

        <Card>
          <MetricHead
            label="Lighthouse"
            value={mobileScore}
            hint={
              perfActive
                ? "Measuring now"
                : mobile
                  ? "Mobile category scores"
                  : "Run PageSpeed to chart scores"
            }
            loading={perfActive && mobileScore == null}
            href={`/projects/${project.id}/performance`}
          />
          <ScoreSpark
            values={[
              mobile?.performance,
              mobile?.accessibility,
              mobile?.bestPractices,
              mobile?.seo,
            ]}
            label="Mobile Lighthouse categories: performance, accessibility, best practices, SEO"
          />
        </Card>
      </section>

      <section aria-label="Health and coverage" className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className={crawling ? "ring-primary/40" : undefined}>
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
              Site health
            </h2>
            <p className="text-sm leading-6 text-body">
              {crawling
                ? "Checks are still running."
                : crawled
                  ? `${passingChecks} of ${checks.length} homepage checks passed.`
                  : "Run a crawl to score the homepage."}
            </p>
          </div>

          <div className="flex flex-col gap-5">
            <HealthRow
              label="Checks"
              value={crawled ? `${checkPct}%` : "-"}
              bar={
                <ProgressBar
                  value={checkPct}
                  rating={checkPct >= 90 ? "good" : checkPct >= 50 ? "warn" : crawled ? "bad" : "none"}
                  label={`${checkPct} percent of checks passed`}
                  accent
                />
              }
            />
            <HealthRow
              label="Mobile"
              value={mobileScore == null ? "-" : `${Math.round(mobileScore)}%`}
              bar={
                <ProgressBar
                  value={mobileScore ?? 0}
                  rating={scoreRating(mobileScore)}
                  label={`Mobile performance ${mobileScore ?? 0}`}
                />
              }
            />
          </div>

          <ul className="flex flex-wrap gap-5">
            <LegendDot className="bg-primary" label="Checks" />
            <LegendDot className="bg-good" label="Mobile" />
          </ul>
        </Card>

        <Card className={crawling ? "ring-primary/40" : undefined}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
                Coverage
              </h2>
              <p className="text-sm leading-6 text-body">
                {crawling ? "Reading the homepage." : "What the crawl found on the page."}
              </p>
            </div>
            <div className="flex gap-6 text-right">
              <StatPair label="Checks" value={checks.length} />
              <StatPair label="Issues" value={crawled ? issues.length : "-"} />
            </div>
          </div>

          <SegmentBar
            label={`${stats.passing} passing, ${stats.withIssues} with issues, ${stats.pending} pending`}
            segments={[
              { key: "pass", value: stats.passing, className: "bg-good" },
              { key: "issues", value: stats.withIssues, className: "bg-warn" },
              { key: "pending", value: stats.pending, className: "bg-surface-strong" },
            ]}
          />

          <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
            <DotStat label="Internal links" value={homepage?.internalLinks} loading={crawling} />
            <DotStat label="Images" value={homepage?.imageCount} loading={crawling} />
            <DotStat label="Missing alt" value={homepage?.missingAlt} loading={crawling} warn={(homepage?.missingAlt ?? 0) > 0} />
            <DotStat label="Schema" value={homepage?.schemaCount} loading={crawling} />
            <DotStat label="H2 headings" value={homepage?.h2Count} loading={crawling} />
            <DotStat label="Status" value={homepage?.statusCode} loading={crawling} />
          </dl>
        </Card>
      </section>

      <section
        aria-labelledby="overview-checks"
        className="overflow-hidden rounded-lg bg-surface-soft ring-1 ring-hairline"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="overview-checks" className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
              Homepage checks
            </h2>
            <p className="font-mono text-[12px] text-muted-foreground">
              {crawling
                ? "Crawling now"
                : project.perfRunAt
                  ? `Last PageSpeed ${project.perfRunAt.toLocaleString()}`
                  : "Thirteen checks from the last crawl"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {homepage ? (
              <a
                href={homepage.finalUrl ?? homepage.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-1.5 font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open live page
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            <Button asChild variant="outline" className="h-11 w-fit">
              <Link href={homepage ? `/projects/${project.id}/pages/${homepage.id}` : `/projects/${project.id}/pages`}>
                Full detail
              </Link>
            </Button>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-t border-hairline text-left">
            <caption className="sr-only">Homepage SEO checks and observed values</caption>
            <thead>
              <tr className="border-b border-hairline font-mono text-[12px] text-muted-foreground">
                <th className="px-6 py-3 font-medium">Check</th>
                <th className="px-6 py-3 font-medium">Observed</th>
                <th className="px-6 py-3 font-medium">Hint</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => {
                const result = homepage ? checkValue(homepage, check.id) : { value: "No page yet" };
                const failed = homepage ? failsCheck(homepage, check.id) : false;
                const status = crawling
                  ? "Waiting"
                  : !crawled
                    ? "Waiting"
                    : failed
                      ? "Issue"
                      : "Pass";

                return (
                  <tr key={check.id} className="border-b border-hairline last:border-b-0">
                    <td className="px-6 py-4 text-sm font-medium text-ink">{check.label}</td>
                    <td className="max-w-[280px] px-6 py-4">
                      {crawling ? (
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                          <span className="font-mono text-[12px]">Checking</span>
                        </span>
                      ) : (
                        <p
                          className={cn(
                            "truncate text-sm",
                            crawled && failed ? "text-warn" : "text-body",
                          )}
                          title={result.value}
                        >
                          {result.value}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-[12px] text-muted-foreground">
                      {check.hint}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 font-mono text-[12px] leading-4",
                          status === "Pass" && "bg-good/15 text-good",
                          status === "Issue" && "bg-warn/15 text-warn",
                          status === "Waiting" && "bg-surface-card text-muted-foreground",
                        )}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-6 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MetricHead({
  label,
  value,
  hint,
  loading,
  href,
}: {
  label: string;
  value: number | null;
  hint: string;
  loading?: boolean;
  href?: string;
}) {
  const title = (
    <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
  );

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {href ? (
          <Link
            href={href}
            className="hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {title}
          </Link>
        ) : (
          title
        )}
        {loading ? (
          <p className="flex items-center gap-2 font-display text-[32px] leading-none tracking-[-1px] text-body">
            <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
            <span className="sr-only">Loading {label}</span>
          </p>
        ) : (
          <p
            className={cn(
              "font-display text-[32px] leading-none tracking-[-1px] tabular-nums",
              typeof value === "number" ? ratingText[scoreRating(label === "Words" ? wordScore(value) : value)] : "text-ink",
            )}
          >
            {value == null ? "-" : value.toLocaleString()}
          </p>
        )}
        <p className="text-xs leading-5 text-body">{hint}</p>
      </div>
    </div>
  );
}

function wordScore(words: number): number {
  return words >= THIN_WORD_LIMIT ? 90 : words >= THIN_WORD_LIMIT * 0.5 ? 60 : 30;
}

function HealthRow({
  label,
  value,
  bar,
}: {
  label: string;
  value: string;
  bar: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
        <p className="font-mono text-[12px] tabular-nums text-ink">{value}</p>
      </div>
      {bar}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-2 font-mono text-[12px] text-body">
      <span aria-hidden className={cn("size-2 rounded-full", className)} />
      {label}
    </li>
  );
}

function StatPair({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-display text-[20px] leading-6 tracking-[-0.3px] tabular-nums text-ink">
        {value}
      </p>
      <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}

function DotStat({
  label,
  value,
  loading,
  warn,
}: {
  label: string;
  value: number | null | undefined;
  loading?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="flex items-center gap-2 text-sm text-body">
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", warn ? "bg-warn" : "bg-good")}
        />
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono text-sm tabular-nums",
          warn ? "text-warn" : "text-ink",
        )}
      >
        {loading ? (
          <LoaderCircle className="size-3.5 animate-spin text-primary" aria-label={`Loading ${label}`} />
        ) : value == null ? (
          "-"
        ) : (
          value.toLocaleString()
        )}
      </dd>
    </div>
  );
}

function ChartPending({ label }: { label: string }) {
  return (
    <div className="flex h-[124px] w-[140px] flex-col items-center justify-center gap-2">
      <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden />
      <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
