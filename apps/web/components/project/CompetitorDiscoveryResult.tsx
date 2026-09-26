import type { DiscoveryResult } from "@seo-maker/core/competitors";
import { ArrowRight, CircleCheck, Info, Radar } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

const HEADLINE: Record<DiscoveryResult["outcome"], string> = {
  new: "Strongest observed search competitor",
  refreshed: "Strongest observed search competitor",
  existing: "No new competitor found",
  "in-progress": "Strongest observed search competitor",
  "limit-reached": "Strongest observed search competitor",
  none: "No competitor found",
};

/**
 * What the last discovery run found. The numbers are observed search
 * evidence from the searches checked, never a ranking assessment, and the
 * card says so.
 */
export function CompetitorDiscoveryResult({ projectId, result }: { projectId: string; result: DiscoveryResult }) {
  const found = result.domain != null;
  const reused = result.outcome === "existing";
  return (
    <section aria-label="Competitor discovery result" className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-hairline",
              found ? "bg-surface-card" : "bg-canvas text-muted-foreground",
            )}
          >
            {found ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(result.domain!)}&sz=64`} alt="" width={20} height={20} className="size-5" />
            ) : (
              <Radar className="size-4" aria-hidden />
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-mono text-[12px] text-muted-foreground">{HEADLINE[result.outcome]}</p>
            {found ? <p className="font-display text-[22px] leading-7 tracking-[-0.4px] text-ink">{result.domain}</p> : null}
            <p className="max-w-2xl text-sm leading-6 text-body">{result.message}</p>
          </div>
        </div>
        {result.competitorId ? (
          <Link
            href={`/projects/${projectId}/competitors/${result.competitorId}`}
            className="inline-flex h-11 w-fit items-center gap-1.5 rounded-md bg-surface-card px-4 font-mono text-[12px] text-ink ring-1 ring-hairline hover:bg-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View Competitor Analysis
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      {found ? (
        <dl className="grid gap-2 text-sm sm:grid-cols-4">
          <Fact label="Found in" value={`${result.appearances} of ${result.queriesChecked} searches`} />
          <Fact label="Top-10 appearances" value={String(result.top10)} />
          <Fact label="Best position" value={result.bestPosition == null ? "—" : `#${result.bestPosition}`} />
          <Fact label="Average position" value={result.avgPosition == null ? "—" : result.avgPosition.toFixed(1)} />
        </dl>
      ) : null}

      {reused ? (
        <p className="flex items-start gap-2 text-sm leading-6 text-body">
          <CircleCheck className="mt-1 size-4 shrink-0 text-good" aria-hidden />
          <span>
            Existing analysis reused: its pages were not crawled again.
            {result.lastAnalyzedAt ? ` Last analyzed ${dateFmt.format(new Date(result.lastAnalyzedAt))}.` : ""}
            {result.confidenceRefreshed ? " Confidence was recalculated with the new search results." : ""}
          </span>
        </p>
      ) : null}

      {result.runnersUp.length > 0 || result.excluded.length > 0 ? (
        <details className="group rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline">
          <summary className="cursor-pointer font-mono text-[12px] text-body marker:text-muted-soft">Other domains in these searches</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {result.runnersUp.length > 0 ? (
              <div>
                <p className="font-mono text-[11px] text-muted-foreground">Also recurring</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                  {result.runnersUp.map((row) => (
                    <li key={row.domain} className="flex justify-between gap-3">
                      <span className="truncate text-ink">{row.domain}</span>
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                        {row.appearances} searches · best #{row.bestPosition}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.excluded.length > 0 ? (
              <div>
                <p className="font-mono text-[11px] text-muted-foreground">Set aside</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                  {result.excluded.map((row) => (
                    <li key={row.domain} className="flex justify-between gap-3">
                      <span className="truncate text-body">{row.domain}</span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">{row.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <p className="flex items-start gap-2 text-[12px] leading-5 text-muted-soft">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Observed search competition evidence from {result.queries.count} searches
          {result.market.country ? ` checked in ${result.market.country}` : ""} ({result.queries.fetched} fetched now, {result.queries.reused} reused
          {result.queries.failed > 0 ? `, ${result.queries.failed} could not be checked` : ""}). Not a ranking assessment or prediction.
        </span>
      </p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-canvas p-3 ring-1 ring-hairline">
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono tabular-nums text-ink">{value}</dd>
    </div>
  );
}
