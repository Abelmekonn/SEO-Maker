import type { Page } from "@seo-maker/db";
import { Check, CircleAlert } from "lucide-react";
import { checks, checkValue, failsCheck, isCrawled } from "@/lib/page-audit";
import { cn } from "@/lib/utils";

export function PageChecks({ page }: { page: Page }) {
  const crawled = isCrawled(page);
  const rows = checks
    .map((check) => ({
      ...check,
      failed: failsCheck(page, check.id),
      result: checkValue(page, check.id),
    }))
    .sort((a, b) => Number(b.failed) - Number(a.failed));
  const failing = rows.filter((row) => row.failed).length;
  const passing = checks.length - failing;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <section
        aria-label="Checks"
        className="rounded-lg bg-surface-soft ring-1 ring-hairline"
      >
        <ul className="divide-y divide-hairline">
          {rows.map((row) => (
            <li key={row.id} className="flex gap-4 px-6 py-5">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                  !crawled && "bg-surface-card text-muted-foreground",
                  crawled && row.failed && "bg-warn/15 text-warn",
                  crawled && !row.failed && "bg-good/15 text-good",
                )}
              >
                {!crawled ? null : row.failed ? (
                  <CircleAlert className="size-4" />
                ) : (
                  <Check className="size-3.5" strokeWidth={3} />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-medium text-ink">{row.label}</p>
                  <p className="font-mono text-[12px] text-muted-foreground">{row.hint}</p>
                </div>
                <p
                  className={cn(
                    "break-words text-sm leading-6",
                    crawled && row.failed ? "text-warn" : "text-body",
                  )}
                >
                  <span className="sr-only">
                    {!crawled ? "Pending. " : row.failed ? "Failed. " : "Passed. "}
                  </span>
                  {row.result.value}
                </p>
                {row.result.detail ? (
                  <p className="break-words text-xs leading-5 text-muted-foreground">
                    {row.result.detail}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
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
            aria-label={crawled ? `${passing} passed, ${failing} failed` : "Waiting for crawl"}
            className="flex h-2 w-full overflow-hidden rounded-full bg-surface-card"
          >
            {crawled ? (
              <>
                <span className="bg-good" style={{ width: `${(passing / checks.length) * 100}%` }} />
                <span className="bg-warn" style={{ width: `${(failing / checks.length) * 100}%` }} />
              </>
            ) : null}
          </div>
          <p className="text-sm leading-6 text-body">
            {!crawled
              ? "Results appear when the crawl finishes."
              : failing === 0
                ? "This page passes every check."
                : `${failing} ${failing === 1 ? "check needs" : "checks need"} a fix.`}
          </p>
        </div>

        <dl className="flex flex-col rounded-lg bg-surface-soft ring-1 ring-hairline">
          <Fact label="Requested URL" value={page.url} />
          {page.finalUrl && page.finalUrl !== page.url ? (
            <Fact label="Final URL" value={page.finalUrl} />
          ) : null}
          <Fact
            label="HTTPS"
            value={page.isHttps == null ? "-" : page.isHttps ? "Yes" : "No"}
          />
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
