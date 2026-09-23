import { geoReadinessBandLabels, type GeoReadinessBand } from "@seo-maker/core/scoring";
import { ScoreRing } from "@/components/project/ScoreRing";
import type { DimensionRow } from "@/lib/geo";
import { cn } from "@/lib/utils";

/**
 * The AI Search Readiness headline.
 *
 * The score is never shown on its own. `redistribute` will return 100 from a
 * single measured dimension — correct arithmetic, misleading headline — so the
 * measured share sits beside it and the caveat is plain when coverage is low.
 */
export function GeoReadinessCard({
  score,
  band,
  coverage,
  measuredCount,
}: {
  score: number | null;
  band: string | null;
  coverage: number;
  measuredCount: number;
}) {
  const low = coverage < 0.5;

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">AI Search Readiness</h2>
        {band ? (
          <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
            {geoReadinessBandLabels[band as GeoReadinessBand] ?? band}
          </span>
        ) : null}
      </div>

      {score == null ? (
        <p className="text-[13px] leading-6 text-body">
          Not enough evidence to score AI Search Readiness yet.
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <ScoreRing score={score} size={72} strokeWidth={6} label="AI Search Readiness" centerValue showValue />
          <div className="min-w-0">
            <p className="text-[12px] leading-5 text-muted-foreground">
              Measured on {measuredCount} of 7 signals
            </p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
              {Math.round(coverage * 100)}% of the scoring weight
            </p>
          </div>
        </div>
      )}

      {low && score != null ? (
        <p className="rounded-lg bg-canvas px-3 py-2.5 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">
          Most signals have not been measured yet, so their weight was spread across the ones that
          were. Treat this as a partial reading rather than a full score.
        </p>
      ) : null}

      <p className="text-[11px] leading-4 text-muted-soft">
        A diagnostic of how clearly this site presents itself to AI-driven search. It is not a
        ranking score and does not predict whether any assistant will cite you.
      </p>
    </section>
  );
}

/** The seven dimensions, with unmeasured ones stating why. */
export function GeoDimensionList({ rows }: { rows: DimensionRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-medium text-ink">{row.label}</span>
            <span
              className={cn(
                "shrink-0 font-mono text-[12px] tabular-nums",
                row.value == null ? "text-muted-soft" : "text-ink",
              )}
            >
              {row.value ?? "Not measured"}
            </span>
          </div>
          <span className="h-1.5 overflow-hidden rounded-full bg-surface-card">
            {row.value != null ? (
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${row.value}%` }}
              />
            ) : null}
          </span>
          {row.value == null && row.reason ? (
            <p className="text-[11px] leading-4 text-muted-soft">{row.reason}</p>
          ) : null}
          {row.value != null && row.weight != null ? (
            <p className="text-[11px] leading-4 text-muted-soft">
              Carries {Math.round(row.weight)} of the 100 points after redistribution.
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
