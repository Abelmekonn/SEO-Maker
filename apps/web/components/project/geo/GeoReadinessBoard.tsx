import type { GeoAudit } from "@seo-maker/db";
import { GEO_WEIGHTS } from "@seo-maker/core/geo";
import { geoReadinessBandLabels, type GeoReadinessBand } from "@seo-maker/core/scoring";
import { CircleHelp, Gauge, Layers, Percent, ShieldCheck } from "lucide-react";
import { MetricCard, Panel } from "@/components/project/geo/board-primitives";
import { ScoreRing } from "@/components/project/ScoreRing";
import type { DimensionRow } from "@/lib/geo";
import { cn } from "@/lib/utils";

/**
 * The AI Readiness board.
 *
 * Its job is to answer the question the headline number provokes: why is the
 * score what it is when most signals have not been measured? So every measured
 * signal shows both its original weight and the weight it ended up carrying,
 * and the unmeasured ones are listed with the reason they were dropped rather
 * than hidden.
 */
export function GeoReadinessBoard({
  audit,
  rows,
  coverage,
}: {
  audit: GeoAudit;
  rows: DimensionRow[];
  coverage: number;
}) {
  const measured = rows.filter((row) => row.value != null);
  const unmeasured = rows.filter((row) => row.value == null);
  const score = audit.readinessScore;
  const lowCoverage = coverage < 0.5;

  const deferred = (audit.deferredPages ?? []) as unknown[];

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Readiness summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Gauge}
          label="Readiness score"
          value={score == null ? undefined : Math.round(score)}
          denominator={score == null ? undefined : "100"}
          hint={
            audit.readinessBand
              ? geoReadinessBandLabels[audit.readinessBand as GeoReadinessBand]
              : "Nothing measurable in this run"
          }
        />
        <MetricCard
          icon={Layers}
          label="Signals measured"
          value={`${measured.length} / 7`}
          tone={measured.length >= 4 ? "good" : "default"}
          hint="Each one is scored independently"
        />
        <MetricCard
          icon={Percent}
          label="Weight covered"
          value={`${Math.round(coverage * 100)}%`}
          tone={lowCoverage ? "bad" : "good"}
          hint="Share of the 100 points actually measured"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Pages analyzed"
          value={audit.pagesAnalyzed}
          hint={
            deferred.length > 0
              ? `${deferred.length} more were outside the budget`
              : "Selected from the last crawl"
          }
        />
      </section>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Panel title={`Measured signals (${measured.length})`}>
            {measured.length === 0 ? (
              <p className="rounded-lg bg-canvas px-4 py-3 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">
                Nothing could be measured in this run.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {measured.map((row) => (
                  <SignalRow key={row.id} row={row} />
                ))}
              </ul>
            )}
          </Panel>

          {unmeasured.length > 0 ? (
            <Panel title={`Not measured (${unmeasured.length})`}>
              {/* Listed, not hidden: a score you cannot account for is worse
                  than a smaller one you can. */}
              <ul className="flex flex-col gap-2">
                {unmeasured.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-ink">{row.label}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
                        {row.reason ?? "No reason was recorded."}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] leading-4 text-muted-soft">
                      {GEO_WEIGHTS[row.id]} pts released
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
                Their weight was spread across the signals that were measured. None of them counts
                as a zero, which is why the score can be high while coverage is low.
              </p>
            </Panel>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <Panel title="AI Search Readiness">
            {score == null ? (
              <p className="text-[13px] leading-6 text-body">
                Not enough evidence to score this site yet.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <ScoreRing
                    score={Math.round(score)}
                    size={84}
                    strokeWidth={7}
                    label="AI Search Readiness"
                    centerValue
                    showValue
                  />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-ink">
                      {audit.readinessBand
                        ? geoReadinessBandLabels[audit.readinessBand as GeoReadinessBand]
                        : null}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
                      from {measured.length} of 7 signals
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">Weight covered</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-soft">
                      {Math.round(coverage * 100)}%
                    </span>
                  </div>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-card">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        lowCoverage ? "bg-warn" : "bg-good",
                      )}
                      style={{ width: `${Math.max(2, coverage * 100)}%` }}
                    />
                  </span>
                </div>

                {lowCoverage ? (
                  <div className="flex gap-2 rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-hairline">
                    <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-muted-soft" aria-hidden />
                    <p className="text-[11px] leading-4 text-muted-soft">
                      Most signals have not been measured, so their weight moved onto the ones that
                      were. Read this as a partial reading, not a full score.
                    </p>
                  </div>
                ) : null}
              </>
            )}

            <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
              A diagnostic of how clearly this site presents itself to AI-driven search. Not a
              ranking score, and not a prediction that any assistant will cite you.
            </p>
          </Panel>

          <Panel title="Run details">
            <dl className="flex flex-col gap-2">
              <Detail label="Outcome" value={audit.status} />
              <Detail label="Mode" value={audit.mode} />
              <Detail label="Started by" value={audit.trigger} />
              <Detail label="Pages selected" value={String(audit.pagesSelected)} />
              <Detail label="Ruleset" value={audit.rulesetVersion} />
              <Detail label="AI used" value={audit.aiUsed ? "Yes" : "No, rule-based"} />
            </dl>
            <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
              A run stays partial while signals remain unimplemented. It reports completed only once
              every signal has a check behind it.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function SignalRow({ row }: { row: DimensionRow }) {
  const original = GEO_WEIGHTS[row.id];
  const carried = row.weight == null ? null : Math.round(row.weight);
  const gained = carried != null && carried > original;

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">{row.label}</span>
        <span className="font-mono text-[15px] tabular-nums text-ink">{row.value}</span>
      </div>

      <span className="h-2 overflow-hidden rounded-full bg-surface-card">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${row.value}%` }}
        />
      </span>

      {/* The weight it started with against the weight it ended up carrying.
          This is what explains a high score at low coverage. */}
      {carried != null ? (
        <p className="text-[11px] leading-4 text-muted-soft">
          Weighted {original} of 100 normally
          {gained ? (
            <>
              , carrying{" "}
              <span className="font-mono text-muted-foreground">{carried}</span> here because other
              signals were not measured
            </>
          ) : (
            <> and carrying {carried} here</>
          )}
          .
        </p>
      ) : null}
    </li>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-muted-soft">{label}</dt>
      <dd className="truncate font-mono text-[11px] capitalize text-muted-foreground">{value}</dd>
    </div>
  );
}
