import type { Page } from "@seo-maker/db";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Calendar,
  CircleCheck,
  CircleOff,
  Crosshair,
  FileText,
  Type,
} from "lucide-react";
import { ScoreRing } from "@/components/project/ScoreRing";
import { checks, pageAuditStats, siteSeoScore } from "@/lib/page-audit";
import { scoreRating } from "@/lib/performance";
import { cn } from "@/lib/utils";

function CoverageChip({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: typeof Crosshair;
  label: string;
  value: number;
  iconClass: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-canvas px-2.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", iconClass)}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <dd className="font-display text-[18px] leading-none tabular-nums text-ink">{value}</dd>
      </div>
      <dt className="font-mono text-[11px] leading-4 text-muted-foreground">{label}</dt>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  bar,
  barClass,
  icon: Icon,
  warn,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  bar: number;
  barClass: string;
  icon: typeof FileText;
  warn?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex min-h-[132px] flex-col justify-between gap-3 rounded-lg bg-surface-soft px-5 py-4 ring-1 ring-hairline">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-md bg-surface-card text-body">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "font-display text-[32px] leading-8 tracking-[-0.6px] tabular-nums",
            warn ? "text-bad" : "text-ink",
          )}
        >
          {value}
        </p>
        <p className="text-xs leading-5 text-body">
          {loading ? "Updating as pages finish" : hint}
        </p>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-card">
        <span className={cn("block h-full rounded-full", barClass)} style={{ width: `${bar}%` }} />
      </div>
    </div>
  );
}

export function PagesAnalytics({
  pages,
  maxPages,
  planLabel,
}: {
  pages: Page[];
  maxPages: number;
  planLabel: string;
}) {
  const stats = pageAuditStats(pages);
  const crawling = stats.pending > 0;
  const passPct = stats.total === 0 ? 0 : Math.round((stats.passing / stats.total) * 100);
  const issuePct = stats.total === 0 ? 0 : Math.round((stats.withIssues / stats.total) * 100);
  const pendingPct = Math.max(0, 100 - passPct - issuePct);
  const crawledPct = maxPages <= 0 ? 0 : Math.round((Math.min(stats.total, maxPages) / maxPages) * 100);
  const wordPages = pages.filter((page) => page.wordCount != null);
  const avgWords =
    wordPages.length === 0
      ? null
      : Math.round(
          wordPages.reduce((sum, page) => sum + (page.wordCount ?? 0), 0) / wordPages.length,
        );
  const wordsBar = avgWords == null ? 0 : Math.min(100, Math.round((avgWords / 600) * 100));
  const health = siteSeoScore(pages);
  const healthRating = scoreRating(health);
  const failingChecks = checks
    .map((check) => ({
      id: check.id,
      label: check.label,
      count: stats.failures[check.id],
      pct: stats.crawled === 0 ? 0 : Math.round((stats.failures[check.id] / stats.crawled) * 100),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const healthCopy =
    health == null
      ? "Run a crawl to score the site."
      : healthRating === "good"
        ? "Most pages pass the on-page checks."
        : "Focus on fixing critical issues and improving page content.";

  return (
    <section aria-label="Page analytics" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi
          label="Crawled"
          value={stats.total.toLocaleString()}
          hint={`${stats.total} of ${maxPages} on ${planLabel}`}
          bar={crawledPct}
          barClass="bg-primary"
          icon={FileText}
          loading={crawling}
        />
        <Kpi
          label="Passing"
          value={stats.crawled === 0 ? "0%" : `${passPct}%`}
          hint={
            stats.passing === 1 ? "1 page passes every check" : `${stats.passing} pages pass every check`
          }
          bar={passPct}
          barClass="bg-good"
          icon={CircleCheck}
        />
        <Kpi
          label="With issues"
          value={stats.withIssues.toLocaleString()}
          hint={
            stats.withIssues === 1 ? "1 page needs a look" : `${stats.withIssues} pages need a look`
          }
          bar={issuePct}
          barClass="bg-bad"
          icon={AlertTriangle}
          warn={stats.withIssues > 0}
        />
        <Kpi
          label="Avg words"
          value={avgWords == null ? "-" : avgWords.toLocaleString()}
          hint="Across crawled pages"
          bar={wordsBar}
          barClass="bg-primary"
          icon={Type}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(13rem,16rem)]">
        <div className="flex flex-col justify-between gap-6 rounded-2xl bg-surface-soft p-5 ring-1 ring-hairline">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-card text-body">
              <BarChart3 className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
                Coverage
              </h2>
              <p className="text-sm leading-6 text-body">
                {stats.passing} pass, {stats.withIssues} have issues, {stats.pending} waiting.
              </p>
            </div>
          </div>
          <div
            role="img"
            aria-label={`${stats.passing} passing, ${stats.withIssues} with issues, ${stats.pending} pending`}
            className="h-2 w-full overflow-hidden rounded-full bg-canvas"
          >
            <div className="flex h-full w-full">
              <span className="h-full bg-good" style={{ width: `${passPct}%` }} />
              <span className="h-full bg-warn" style={{ width: `${issuePct}%` }} />
              <span className="h-full bg-surface-strong" style={{ width: `${pendingPct}%` }} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CoverageChip
              icon={Crosshair}
              label="Analyzed"
              value={stats.analyzed}
              iconClass="bg-good/15 text-good"
            />
            <CoverageChip
              icon={Calendar}
              label="In progress"
              value={stats.pending}
              iconClass="bg-warn/15 text-warn"
            />
            <CoverageChip
              icon={Bell}
              label="Issues"
              value={stats.withIssues}
              iconClass="bg-surface-card text-body"
            />
            <CoverageChip
              icon={CircleOff}
              label="Failed"
              value={stats.failed}
              iconClass="bg-surface-card text-body"
            />
          </dl>
        </div>

        <div className="flex flex-col gap-4 rounded-lg bg-surface-soft p-5 ring-1 ring-hairline">
          <div className="flex flex-col gap-0.5">
            <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              <AlertTriangle className="size-4 text-bad" aria-hidden />
              Top failing checks
            </h2>
            <p className="text-sm leading-6 text-body">
              Share of crawled pages that fail each check.
            </p>
          </div>
          {failingChecks.length === 0 ? (
            <p className="text-sm leading-6 text-body">
              {stats.crawled === 0 ? "No check data yet." : "No failing checks on crawled pages."}
            </p>
          ) : (
            <ul aria-label="Failing checks" className="flex flex-1 flex-col justify-center gap-2">
              {failingChecks.map((row) => (
                <li key={row.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm text-ink">{row.label}</p>
                    <p className="shrink-0 font-mono text-[12px] tabular-nums text-bad">
                      {row.pct}%
                    </p>
                  </div>
                  <div
                    role="img"
                    aria-label={`${row.label}: ${row.pct} percent`}
                    className="h-1.5 overflow-hidden rounded-full bg-surface-card"
                  >
                    <span className="block h-full rounded-full bg-bad" style={{ width: `${row.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-surface-soft p-5 text-center ring-1 ring-hairline">
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
            SEO health
          </h2>
          <ScoreRing score={health} size={110} strokeWidth={10} label="SEO health" centerValue />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">
              {health == null
                ? "No score yet"
                : healthRating === "good"
                  ? "Good"
                  : healthRating === "warn"
                    ? "Needs improvement"
                    : "Poor"}
            </p>
            <p className="max-w-[28ch] text-xs leading-5 text-body">{healthCopy}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
