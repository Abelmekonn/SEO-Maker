import type { Page, PageIssue } from "@seo-maker/db";
import { Check, CircleAlert, Lock, TriangleAlert } from "lucide-react";
import { GoPremiumButton } from "@/components/project/PremiumGate";
import { checks, checkValue, isCrawled } from "@/lib/page-audit";
import { cn } from "@/lib/utils";

/**
 * Every check the crawler ran on one page.
 *
 * Reads the persisted `PageIssue` rows the worker writes rather than
 * recomputing the verdict here. Those rows carry the severity, the observed
 * evidence and the recommendation, none of which a recomputation recovers —
 * and they are the same records the AI layer and reports consume, so what the
 * user reads cannot disagree with what the model was given.
 *
 * `checkValue` is still used, for the passing rows only: a pass has no issue
 * record by design, but the page should still show what was found.
 */

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

type Row = {
  id: string;
  label: string;
  hint: string;
  issue: PageIssue | null;
  observed: string;
  detail: string | null;
};

export function PageChecks({
  page,
  detailed = true,
}: {
  page: Page & { issues: PageIssue[] };
  /** Free names the problem; premium shows the evidence and the fix. */
  detailed?: boolean;
}) {
  const crawled = isCrawled(page);
  const byCheck = new Map(page.issues.map((issue) => [issue.checkId, issue]));

  const rows: Row[] = checks.map((check) => {
    const issue = byCheck.get(check.id) ?? null;
    const observed = checkValue(page, check.id);
    return {
      id: check.id,
      label: check.label,
      hint: check.hint,
      issue,
      observed: issue ? (detailed ? issue.evidence ?? observed.value : `Expected: ${check.hint}`) : observed.value,
      detail: issue ? null : observed.detail ?? null,
    };
  });

  // Failing first, worst severity first, so the top of the list is the work.
  rows.sort((a, b) => {
    const aRank = a.issue ? SEVERITY_ORDER[a.issue.severity] ?? 4 : 9;
    const bRank = b.issue ? SEVERITY_ORDER[b.issue.severity] ?? 4 : 9;
    return aRank - bRank;
  });

  const failing = page.issues.filter((issue) => issue.status === "fail").length;
  const warning = page.issues.filter((issue) => issue.status === "warning").length;
  const passing = checks.length - page.issues.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <section aria-label="Checks" className="rounded-lg bg-surface-soft ring-1 ring-hairline">
        <ul className="divide-y divide-hairline">
          {rows.map((row) => {
            const status = row.issue?.status ?? (crawled ? "pass" : "pending");
            return (
              <li key={row.id} className="flex gap-4 px-6 py-5">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    status === "pending" && "bg-surface-card text-muted-foreground",
                    status === "fail" && "bg-bad/15 text-bad",
                    status === "warning" && "bg-warn/15 text-warn",
                    status === "pass" && "bg-good/15 text-good",
                  )}
                >
                  {status === "pending" ? null : status === "fail" ? (
                    <CircleAlert className="size-4" />
                  ) : status === "warning" ? (
                    <TriangleAlert className="size-4" />
                  ) : (
                    <Check className="size-3.5" strokeWidth={3} />
                  )}
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium text-ink">{row.label}</p>
                    {row.issue ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[11px] leading-5",
                          row.issue.severity === "critical" && "bg-bad/15 text-bad",
                          row.issue.severity === "high" && "bg-bad/10 text-bad",
                          row.issue.severity === "medium" && "bg-warn/15 text-warn",
                          row.issue.severity === "low" && "bg-surface-card text-muted-foreground",
                        )}
                      >
                        {SEVERITY_LABEL[row.issue.severity] ?? row.issue.severity}
                      </span>
                    ) : (
                      <p className="font-mono text-[12px] text-muted-foreground">{row.hint}</p>
                    )}
                  </div>

                  <p
                    className={cn(
                      "break-words text-sm leading-6",
                      status === "fail" ? "text-bad" : status === "warning" ? "text-warn" : "text-body",
                    )}
                  >
                    <span className="sr-only">
                      {status === "pending"
                        ? "Pending. "
                        : status === "fail"
                          ? "Failed. "
                          : status === "warning"
                            ? "Warning. "
                            : "Passed. "}
                    </span>
                    {row.observed}
                  </p>

                  {row.detail ? (
                    <p className="break-words text-xs leading-5 text-muted-foreground">
                      {row.detail}
                    </p>
                  ) : null}

                  {detailed && row.issue?.recommendation ? (
                    <p className="mt-0.5 break-words border-l-2 border-hairline pl-3 text-xs leading-5 text-muted-foreground">
                      {row.issue.recommendation}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {!detailed && page.issues.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-6 py-4">
            <p className="flex min-w-0 items-start gap-2 text-sm leading-6 text-body">
              <Lock className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              Premium shows the exact error the crawler found on each check and how to fix it.
            </p>
            <GoPremiumButton />
          </div>
        ) : null}
      </section>

      <aside className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
          <p className="font-mono text-[12px] text-muted-foreground">Checks passed</p>
          <p className="font-display text-[40px] leading-none tracking-[-1px] text-ink tabular-nums">
            {crawled ? passing : "-"}
            <span className="text-body"> / {checks.length}</span>
          </p>
          <div
            role="img"
            aria-label={
              crawled
                ? `${passing} passed, ${failing} failed, ${warning} warnings`
                : "Waiting for crawl"
            }
            className="flex h-2 w-full overflow-hidden rounded-full bg-surface-card"
          >
            {crawled ? (
              <>
                <span className="bg-good" style={{ width: `${(passing / checks.length) * 100}%` }} />
                <span className="bg-warn" style={{ width: `${(warning / checks.length) * 100}%` }} />
                <span className="bg-bad" style={{ width: `${(failing / checks.length) * 100}%` }} />
              </>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-body">
            {!crawled
              ? "Results appear when the crawl finishes."
              : page.issues.length === 0
                ? "This page passes every check."
                : `${failing} failing, ${warning} ${warning === 1 ? "warning" : "warnings"}.`}
          </p>
        </div>

        <dl className="flex flex-col rounded-lg bg-surface-soft ring-1 ring-hairline">
          <Fact label="Requested URL" value={page.url} />
          {page.finalUrl && page.finalUrl !== page.url ? (
            <Fact label="Final URL" value={page.finalUrl} />
          ) : null}
          <Fact label="Status" value={page.statusCode == null ? "-" : String(page.statusCode)} />
          <Fact label="HTTPS" value={page.isHttps == null ? "-" : page.isHttps ? "Yes" : "No"} />
          {page.responseTimeMs != null ? (
            <Fact label="Response" value={`${page.responseTimeMs} ms`} />
          ) : null}
          {page.pageType ? <Fact label="Page type" value={page.pageType} /> : null}
          <Fact label="Crawled" value={page.createdAt.toLocaleDateString()} />
        </dl>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-hairline px-5 py-4 first:border-t-0">
      <dt className="font-mono text-[12px] text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}
