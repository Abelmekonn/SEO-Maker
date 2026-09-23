import type { Page } from "@seo-maker/db";
import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, Lock, TriangleAlert } from "lucide-react";
import { GoPremiumButton } from "@/components/project/PremiumGate";
import { checks, isCrawled, toPageIssues, type PageIssueRecord } from "@/lib/page-audit";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * The problems the crawler found, on the overview.
 *
 * Free names each problem on the homepage. Premium shows every crawled page,
 * with the exact evidence the crawler saw and the fix, which is the same
 * record the page detail screen renders.
 */

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
const LABEL = Object.fromEntries(checks.map((check) => [check.id, check.label]));

type Finding = PageIssueRecord & { page: Page };

function findingsFor(pages: Page[]): Finding[] {
  return pages
    .filter(isCrawled)
    .flatMap((page) => toPageIssues(page).map((issue) => ({ ...issue, page })))
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4) ||
        a.page.url.localeCompare(b.page.url),
    );
}

export function OverviewProblems({
  pages,
  projectId,
  detailed,
}: {
  pages: Page[];
  projectId: string;
  /** Premium: evidence, fix and every page. Free: problem names only. */
  detailed: boolean;
}) {
  const crawled = pages.filter(isCrawled);
  const findings = findingsFor(pages);
  const failing = findings.filter((row) => row.status === "fail").length;
  const warnings = findings.length - failing;
  const visible = detailed ? findings.slice(0, 8) : findings;

  return (
    <section
      aria-labelledby="problems-heading"
      className="flex flex-col overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4">
        <div className="flex flex-col gap-1">
          <h2
            id="problems-heading"
            className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink"
          >
            {detailed ? "Problems found" : "What is wrong on your homepage"}
          </h2>
          <p className="font-mono text-[12px] text-muted-foreground">
            {crawled.length === 0
              ? "Results appear when the crawl finishes"
              : `${failing} failing, ${warnings} ${warnings === 1 ? "warning" : "warnings"} across ${crawled.length} ${crawled.length === 1 ? "page" : "pages"}`}
          </p>
        </div>
        {detailed ? (
          <Link
            href={`/projects/${projectId}/pages`}
            className="inline-flex h-11 items-center gap-1 font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            All pages
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {crawled.length > 0 && findings.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-body">
          <Check className="size-4 text-good" aria-hidden />
          {detailed ? "Every crawled page passes every check." : "Your homepage passes every check."}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {visible.map((row) => (
            <li key={`${row.page.id}-${row.checkId}`} className="flex gap-3 px-5 py-4">
              <StatusIcon status={row.status} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-medium text-ink">{LABEL[row.checkId] ?? row.checkId}</p>
                  <SeverityPill severity={row.severity} />
                  {detailed ? (
                    <Link
                      href={`/projects/${projectId}/pages/${row.page.id}`}
                      className="truncate font-mono text-[12px] text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {pagePath(row.page.finalUrl ?? row.page.url)}
                    </Link>
                  ) : null}
                </div>
                {detailed ? (
                  <>
                    <p
                      className={cn(
                        "break-words text-sm leading-6",
                        row.status === "fail" ? "text-bad" : "text-warn",
                      )}
                    >
                      {row.evidence}
                    </p>
                    {row.recommendation ? (
                      <p className="break-words border-l-2 border-hairline pl-3 text-xs leading-5 text-muted-foreground">
                        {row.recommendation}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm leading-6 text-body">Expected: {row.message}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {detailed && findings.length > visible.length ? (
        <p className="border-t border-hairline px-5 py-3 font-mono text-[12px] text-muted-foreground">
          {findings.length - visible.length} more on the Pages screen
        </p>
      ) : null}

      {!detailed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface-card/40 px-5 py-4">
          <p className="flex min-w-0 items-start gap-2 text-sm leading-6 text-body">
            <Lock className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            Premium shows the exact error on each one, how to fix it, and checks the rest of your
            site.
          </p>
          <GoPremiumButton />
        </div>
      ) : null}
    </section>
  );
}

function StatusIcon({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
        status === "fail" ? "bg-bad/15 text-bad" : "bg-warn/15 text-warn",
      )}
    >
      {status === "fail" ? <CircleAlert className="size-4" /> : <TriangleAlert className="size-4" />}
    </span>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[11px] leading-5",
        severity === "critical" && "bg-bad/15 text-bad",
        severity === "high" && "bg-bad/10 text-bad",
        severity === "medium" && "bg-warn/15 text-warn",
        severity === "low" && "bg-surface-card text-muted-foreground",
      )}
    >
      {SEVERITY_LABEL[severity] ?? severity}
    </span>
  );
}
