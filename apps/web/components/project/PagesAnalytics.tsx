"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CircleCheck,
  CircleDashed,
  CircleOff,
  Crosshair,
  FileText,
  Type,
} from "lucide-react";
import { ScoreRing } from "@/components/project/ScoreRing";
import { checks, hasIssue, isCrawled, pageAuditStats, siteSeoScore } from "@/lib/page-audit";
import { scoreRating } from "@/lib/performance";
import { crawlCounts, crawledPagesOf } from "@/lib/crawl-counts";
import type { TierScope, TieredPage } from "@/lib/site-inventory";
import { cn } from "@/lib/utils";

/**
 * The Pages screen's numbers.
 *
 * Page counts are against the site's page inventory, not the plan's page
 * limit: "97 of 104" is 97 of the 104 pages SEO Maker knows the site has.
 * Wherever a number is about pages, Priority and Standard can be told apart.
 */

const SCOPES: Array<{ id: TierScope; label: string }> = [
  { id: "priority", label: "Priority" },
  { id: "standard", label: "Standard" },
  { id: "general", label: "General" },
];

function ScopeToggle({ value, onChange, label }: { value: TierScope; onChange: (scope: TierScope) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-md bg-canvas p-0.5 ring-1 ring-hairline">
      {SCOPES.map((scope) => (
        <button
          key={scope.id}
          type="button"
          role="radio"
          aria-checked={value === scope.id}
          onClick={() => onChange(scope.id)}
          className={cn(
            "inline-flex h-8 items-center rounded px-2.5 font-mono text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === scope.id ? "bg-surface-card text-ink" : "text-muted-foreground hover:text-ink",
          )}
        >
          {scope.label}
        </button>
      ))}
    </div>
  );
}

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
  suffix,
  hint,
  bar,
  barClass,
  icon: Icon,
  warn,
  loading,
}: {
  label: string;
  value: string;
  suffix?: string;
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
          {suffix ? <span className="text-[16px] tracking-normal text-muted-foreground"> {suffix}</span> : null}
        </p>
        <p className="text-xs leading-5 text-body">{loading ? "Updating as pages finish" : hint}</p>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-card">
        <span className={cn("block h-full rounded-full", barClass)} style={{ width: `${bar}%` }} />
      </div>
    </div>
  );
}

/** Pages with issues, Priority and Standard apart, then in total. */
function IssuesKpi({ priority, standard }: { priority: number; standard: number }) {
  const total = priority + standard;
  return (
    <div className="flex min-h-[132px] flex-col justify-between gap-3 rounded-lg bg-surface-soft px-5 py-4 ring-1 ring-hairline">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[12px] text-muted-foreground">With issues</p>
        <span className="flex size-8 items-center justify-center rounded-md bg-surface-card text-body">
          <AlertTriangle className="size-4" aria-hidden />
        </span>
      </div>
      <p className={cn("font-display text-[32px] leading-8 tracking-[-0.6px] tabular-nums", total > 0 ? "text-bad" : "text-ink")}>
        {total.toLocaleString()}
        <span className="text-[16px] tracking-normal text-muted-foreground"> in total</span>
      </p>
      <dl className="grid grid-cols-2 gap-2">
        {(
          [
            ["Priority Pages", priority, "bg-primary"],
            ["Standard Pages", standard, "bg-muted-foreground/60"],
          ] as const
        ).map(([label, count, dot]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-md bg-canvas px-2.5 py-2">
            <dt className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
              {label}
            </dt>
            <dd className="text-xs leading-5 text-body">
              <span className={cn("font-mono tabular-nums", count > 0 ? "text-bad" : "text-ink")}>{count}</span>{" "}
              {count === 1 ? "page" : "pages"} with issues
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PagesAnalytics({
  pages,
  planLabel,
  maxPages,
}: {
  /** The latest crawl's pages, with their classification. */
  pages: TieredPage[];
  planLabel: string;
  /** Pages the plan crawls. A site never holds more crawled pages than this. */
  maxPages: number;
}) {
  const [coverageScope, setCoverageScope] = useState<TierScope>("general");
  const [checksScope, setChecksScope] = useState<TierScope>("general");

  const all = pageAuditStats(pages);
  // Pages crawled into the system, and how many of them were fetched
  // successfully: 9 of 10 when one failed. Discovered pages never crawled,
  // and files a crawl met, are not counted.
  const counts = crawlCounts(pages);
  const crawledPct = counts.total === 0 ? 0 : Math.round((counts.crawled / counts.total) * 100);
  const passPct = all.crawled === 0 ? 0 : Math.round((all.passing / all.crawled) * 100);
  const issues = {
    priority: pages.filter((page) => page.tier === "priority" && isCrawled(page) && hasIssue(page)).length,
    standard: pages.filter((page) => page.tier === "standard" && isCrawled(page) && hasIssue(page)).length,
  };
  const wordPages = pages.filter((page) => page.wordCount != null);
  const avgWords =
    wordPages.length === 0
      ? null
      : Math.round(wordPages.reduce((sum, page) => sum + (page.wordCount ?? 0), 0) / wordPages.length);
  const wordsBar = avgWords == null ? 0 : Math.min(100, Math.round((avgWords / 600) * 100));
  const health = siteSeoScore(pages);
  const healthRating = scoreRating(health);

  const crawledHint = [
    counts.total === 0
      ? "No pages crawled yet"
      : counts.failed > 0
        ? `${counts.failed} failed`
        : "All fetched successfully",
    `${planLabel} crawls up to ${maxPages}`,
  ].join(" · ");

  // Coverage in the chosen scope, over the pages crawled in it.
  const scoped = coverageScope === "general" ? pages : pages.filter((page) => page.tier === coverageScope);
  const coveragePages = crawledPagesOf(scoped);
  const coverage = pageAuditStats(coveragePages);
  const coverageTotal = coveragePages.length;
  const failedWithIssue = coverage.failed;
  const issueOnly = coverage.withIssues - failedWithIssue;
  const share = (value: number) => (coverageTotal === 0 ? 0 : (value / coverageTotal) * 100);
  const scopeName = coverageScope === "general" ? "" : `${coverageScope === "priority" ? "Priority" : "Standard"} `;

  // Failing checks in the chosen scope, as a share of its crawled pages.
  const checkPages = checksScope === "general" ? pages : pages.filter((page) => page.tier === checksScope);
  const checkStats = pageAuditStats(checkPages);
  const failingChecks = checks
    .map((check) => ({
      id: check.id,
      label: check.label,
      count: checkStats.failures[check.id],
      pct: checkStats.crawled === 0 ? 0 : Math.round((checkStats.failures[check.id] / checkStats.crawled) * 100),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
  const totalFailing = failingChecks.reduce((sum, row) => sum + row.count, 0);

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
          value={counts.crawled.toLocaleString()}
          suffix={`of ${counts.total.toLocaleString()} ${counts.total === 1 ? "page" : "pages"}`}
          hint={crawledHint}
          bar={crawledPct}
          barClass="bg-primary"
          icon={FileText}
          loading={all.pending > 0}
        />
        <Kpi
          label="Passing"
          value={all.crawled === 0 ? "0%" : `${passPct}%`}
          hint={all.passing === 1 ? "1 page passes every check" : `${all.passing} pages pass every check`}
          bar={passPct}
          barClass="bg-good"
          icon={CircleCheck}
        />
        <IssuesKpi priority={issues.priority} standard={issues.standard} />
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-card text-body">
                <BarChart3 className="size-4" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">Coverage</h2>
                <p className="text-sm leading-6 text-body">
                  {coverageTotal === 0
                    ? `No ${scopeName}pages crawled yet.`
                    : `${coverage.passing} pass, ${issueOnly} ${issueOnly === 1 ? "has" : "have"} issues, ${coverage.failed} failed, of ${coverageTotal} crawled ${scopeName}${coverageTotal === 1 ? "page" : "pages"}.`}
                </p>
              </div>
            </div>
            <ScopeToggle value={coverageScope} onChange={setCoverageScope} label="Coverage scope" />
          </div>
          <div
            role="img"
            aria-label={`${coverage.passing} passing, ${issueOnly} with issues, ${coverage.failed} failed, ${coverage.pending} in progress`}
            className="h-2 w-full overflow-hidden rounded-full bg-canvas"
          >
            <div className="flex h-full w-full">
              <span className="h-full bg-good" style={{ width: `${share(coverage.passing)}%` }} />
              <span className="h-full bg-warn" style={{ width: `${share(issueOnly)}%` }} />
              <span className="h-full bg-bad" style={{ width: `${share(coverage.failed)}%` }} />
              <span className="h-full bg-surface-strong" style={{ width: `${share(coverage.pending)}%` }} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CoverageChip icon={Crosshair} label="Analyzed" value={coverage.analyzed} iconClass="bg-good/15 text-good" />
            <CoverageChip icon={AlertTriangle} label="Issues" value={issueOnly} iconClass="bg-warn/15 text-warn" />
            <CoverageChip icon={CircleOff} label="Failed" value={coverage.failed} iconClass="bg-bad/15 text-bad" />
            <CoverageChip icon={CircleDashed} label="In progress" value={coverage.pending} iconClass="bg-surface-card text-body" />
          </dl>
        </div>

        <div className="flex flex-col gap-4 rounded-lg bg-surface-soft p-5 ring-1 ring-hairline">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 className="flex items-center gap-2 font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
                <AlertTriangle className="size-4 text-bad" aria-hidden />
                Total failing checks
              </h2>
              <p className="text-sm leading-6 text-body">
                <span className="font-mono tabular-nums text-ink">{totalFailing}</span> across{" "}
                {checkStats.crawled} crawled {checksScope === "general" ? "" : `${checksScope === "priority" ? "Priority" : "Standard"} `}
                {checkStats.crawled === 1 ? "page" : "pages"}. Share of pages failing each:
              </p>
            </div>
            <ScopeToggle value={checksScope} onChange={setChecksScope} label="Failing checks scope" />
          </div>
          {failingChecks.length === 0 ? (
            <p className="text-sm leading-6 text-body">
              {checkStats.crawled === 0 ? "No check data for these pages yet." : "No failing checks on these pages."}
            </p>
          ) : (
            <ul aria-label="Failing checks" className="flex flex-1 flex-col justify-center gap-2">
              {failingChecks.slice(0, 3).map((row) => (
                <li key={row.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm text-ink">{row.label}</p>
                    <p className="shrink-0 font-mono text-[12px] tabular-nums text-bad">
                      {row.count} · {row.pct}%
                    </p>
                  </div>
                  <div
                    role="img"
                    aria-label={`${row.label}: ${row.count} pages, ${row.pct} percent`}
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
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">SEO health</h2>
          <ScoreRing score={health} size={110} strokeWidth={10} label="SEO health" centerValue />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">
              {health == null ? "No score yet" : healthRating === "good" ? "Good" : healthRating === "warn" ? "Needs improvement" : "Poor"}
            </p>
            <p className="max-w-[28ch] text-xs leading-5 text-body">{healthCopy}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
