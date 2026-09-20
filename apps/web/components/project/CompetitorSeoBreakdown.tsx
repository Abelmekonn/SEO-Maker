import {
  SEO_DIMENSION_LABELS,
  type SeoDimensionId,
  seoScoreBand,
  seoScoreBandLabels,
  seoScoreBandRating,
} from "@seo-maker/core/scoring";
import { cn } from "@/lib/utils";

const barClass: Record<string, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  none: "bg-surface-strong",
};

const textClass: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-muted-foreground",
};

export function CompetitorSeoBreakdown({
  title,
  score,
  dimensions,
  notMeasured,
}: {
  title: string;
  score: number | null;
  dimensions: Partial<Record<SeoDimensionId, number | null>>;
  notMeasured: SeoDimensionId[];
}) {
  const band = score == null ? null : seoScoreBand(score);
  const rating = band ? seoScoreBandRating[band] : "none";

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">{title}</h2>
        {score == null ? (
          <span className="font-mono text-[12px] text-muted-soft">Not measured</span>
        ) : (
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-display text-[24px] leading-none tracking-[-0.4px] tabular-nums",
                textClass[rating],
              )}
            >
              {Math.round(score)}
            </span>
            {band ? (
              <span className="font-mono text-[12px] text-muted-foreground">
                {seoScoreBandLabels[band]}
              </span>
            ) : null}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {(Object.keys(SEO_DIMENSION_LABELS) as SeoDimensionId[]).map((id) => {
          const value = dimensions[id] ?? null;
          const missing = value == null || notMeasured.includes(id);
          const dimBand = value == null ? null : seoScoreBand(value);
          const dimRating = dimBand ? seoScoreBandRating[dimBand] : "none";

          return (
            <li key={id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-body">{SEO_DIMENSION_LABELS[id]}</span>
                {missing ? (
                  <span className="rounded-full bg-surface-card px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    Not measured
                  </span>
                ) : (
                  <span className={cn("font-mono text-[12px] tabular-nums", textClass[dimRating])}>
                    {Math.round(value)}
                  </span>
                )}
              </div>
              <div
                role="img"
                aria-label={
                  missing
                    ? `${SEO_DIMENSION_LABELS[id]} not measured`
                    : `${SEO_DIMENSION_LABELS[id]} ${Math.round(value)} out of 100`
                }
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-card"
              >
                {missing ? null : (
                  <span
                    className={cn("block h-full rounded-full", barClass[dimRating])}
                    style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {notMeasured.length > 0 ? (
        <p className="text-[12px] leading-5 text-muted-foreground">
          Unmeasured dimensions are excluded from the score and their weight is spread across the
          rest, so a missing signal never counts as a zero.
        </p>
      ) : null}
    </section>
  );
}
