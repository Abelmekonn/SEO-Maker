import type { Page } from "@seo-maker/db";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { PageAuditTable } from "@/components/project/PageAuditTable";
import { checks, pageAuditStats } from "@/lib/page-audit";
import { cn } from "@/lib/utils";

export function PagesBoard({
  pages,
  projectId,
}: {
  pages: Page[];
  projectId: string;
}) {
  const stats = pageAuditStats(pages);
  const isCrawling = stats.pending > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <CoverageCard stats={stats} isCrawling={isCrawling} />
        <ChecksCard stats={stats} isCrawling={isCrawling} />
      </section>

      <section aria-label="Page list" className="flex min-h-0 flex-1 flex-col gap-3">
        <PageAuditTable pages={pages} projectId={projectId} />
      </section>
    </div>
  );
}

type Stats = ReturnType<typeof pageAuditStats>;

function CoverageCard({ stats, isCrawling }: { stats: Stats; isCrawling: boolean }) {
  const total = Math.max(stats.total, 1);
  const passPct = Math.round((stats.passing / total) * 100);
  const issuePct = Math.round((stats.withIssues / total) * 100);
  const pendingPct = Math.max(0, 100 - passPct - issuePct);

  const summary =
    stats.total === 0
      ? "No pages yet"
      : stats.pending > 0
        ? `${stats.pending} still crawling`
        : stats.withIssues === 0
          ? "Every crawled page passes"
          : `${stats.withIssues} of ${stats.crawled} need a fix`;

  return (
    <div
      className={cn(
        "relative overflow-hidden flex flex-col justify-between gap-6 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline",
        isCrawling && "ring-primary/40",
      )}
    >
      {isCrawling ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-70 animate-pulse"
        />
      ) : null}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[12px] text-muted-foreground">Pages passing every check</p>
        <p className="font-display text-[40px] leading-none tracking-[-1px] text-ink tabular-nums">
          {stats.passing}
          <span className="text-body"> / {stats.total}</span>
        </p>
        <p className="text-sm leading-6 text-body">{summary}</p>
      </div>

      <div className="flex flex-col gap-3">
        <div
          role="img"
          aria-label={`${stats.passing} passing, ${stats.withIssues} with issues, ${stats.pending} pending`}
          className="flex h-2 w-full overflow-hidden rounded-full bg-surface-card"
        >
          <span className="bg-good" style={{ width: `${passPct}%` }} />
          <span className="bg-warn" style={{ width: `${issuePct}%` }} />
          <span className="bg-surface-strong" style={{ width: `${pendingPct}%` }} />
        </div>
        <dl className="grid grid-cols-3 gap-3 text-xs leading-5">
          <Legend swatch="bg-good" label="Passing" value={stats.passing} />
          <Legend swatch="bg-warn" label="Issues" value={stats.withIssues} />
          <Legend swatch="bg-surface-strong" label="Pending" value={stats.pending} />
        </dl>
      </div>
    </div>
  );
}

function ChecksCard({ stats, isCrawling }: { stats: Stats; isCrawling: boolean }) {
  const failing = checks.filter((check) => stats.failures[check.id] > 0).length;

  return (
    <div
      className={cn(
        "relative overflow-hidden flex flex-col gap-4 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline",
        isCrawling && "ring-primary/40",
      )}
    >
      {isCrawling ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-70 animate-pulse"
        />
      ) : null}
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-mono text-[12px] text-muted-foreground">Checks</p>
        <p className="font-mono text-[12px] text-body tabular-nums">
          {stats.crawled === 0
            ? isCrawling
              ? "Crawling now"
              : "Waiting for crawl"
            : failing === 0
              ? `${checks.length} of ${checks.length} pass`
              : `${checks.length - failing} of ${checks.length} pass`}
        </p>
      </div>
      <ul className="grid gap-x-8 sm:grid-cols-2">
        {checks.map((check) => {
          const count = stats.failures[check.id];
          const state = stats.crawled === 0 ? "pending" : count > 0 ? "fail" : "pass";
          return (
            <li
              key={check.id}
              className="flex min-h-11 items-center gap-3 border-t border-hairline first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                  state === "pass" && "bg-good/15 text-good",
                  state === "fail" && "bg-warn/15 text-warn",
                  state === "pending" && "bg-surface-card text-muted-foreground",
                  state === "pending" && isCrawling && "animate-pulse",
                )}
              >
                {state === "pass" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : state === "fail" ? (
                  <CircleAlert className="size-3.5" />
                ) : isCrawling ? (
                  <LoaderCircle className="size-3 animate-spin" />
                ) : null}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink" title={check.hint}>
                {check.label}
              </span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[12px] tabular-nums",
                  state === "fail" ? "text-warn" : "text-muted-foreground",
                )}
              >
                {state === "pending"
                  ? isCrawling
                    ? "Crawling"
                    : "Waiting"
                  : state === "pass"
                    ? "Pass"
                    : `${count} ${count === 1 ? "page" : "pages"}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Legend({
  swatch,
  label,
  value,
}: {
  swatch: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", swatch)} />
      <dt className="text-body">{label}</dt>
      <dd className="ml-auto font-mono tabular-nums text-ink">{value}</dd>
    </div>
  );
}
