import {
  CONFIDENCE_PART_LABELS,
  type ConfidenceBand,
  type ConfidencePartId,
  confidenceBandLabels,
  confidenceBandRating,
} from "@seo-maker/core/scoring";
import { cn } from "@/lib/utils";

type Part = { raw: number; weight: number; points: number };

const ratingText: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-muted-foreground",
};

/**
 * Shows every sub-signal with its post-redistribution weight.
 *
 * This is what operationally keeps Competitor Confidence from being read as an
 * SEO score: the reader can see exactly which evidence produced the number and
 * which signals were unavailable.
 */
export function CompetitorConfidenceCard({
  score,
  band,
  parts,
  domain,
  sharedQueries,
  totalQueries,
  avgPosition,
}: {
  score: number | null;
  band: string | null;
  parts: Partial<Record<ConfidencePartId, Part>> | null;
  domain: string;
  sharedQueries: number;
  totalQueries: number;
  avgPosition: number | null;
}) {
  const typedBand = (band ?? null) as ConfidenceBand | null;
  const rating = typedBand ? confidenceBandRating[typedBand] : "none";

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div>
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          Why this is a competitor
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-body">
          Competitor confidence measures how strongly {domain} competes with you in search. It is
          not an SEO score and not a prediction of rankings.
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-3">
        {score == null ? (
          <p className="text-sm text-muted-foreground">
            Not enough data to score this competitor yet.
          </p>
        ) : (
          <>
            <p
              className={cn(
                "font-display text-[36px] leading-none tracking-[-0.6px] tabular-nums",
                ratingText[rating],
              )}
            >
              {Math.round(score)}
              <span className="text-[16px] text-muted-foreground"> / 100</span>
            </p>
            {typedBand ? (
              <span className="font-mono text-[12px] text-muted-foreground">
                {confidenceBandLabels[typedBand]}
              </span>
            ) : null}
          </>
        )}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-canvas p-3 ring-1 ring-hairline">
          <dt className="font-mono text-[12px] text-muted-foreground">Shared searches</dt>
          <dd className="mt-1 font-mono tabular-nums text-ink">
            {totalQueries === 0 ? "Not measured" : `${sharedQueries} of ${totalQueries}`}
          </dd>
        </div>
        <div className="rounded-lg bg-canvas p-3 ring-1 ring-hairline">
          <dt className="font-mono text-[12px] text-muted-foreground">Average position</dt>
          <dd className="mt-1 font-mono tabular-nums text-ink">
            {avgPosition == null ? "Not measured" : avgPosition.toFixed(1)}
          </dd>
        </div>
        <div className="rounded-lg bg-canvas p-3 ring-1 ring-hairline">
          <dt className="font-mono text-[12px] text-muted-foreground">Signals used</dt>
          <dd className="mt-1 font-mono tabular-nums text-ink">
            {parts ? Object.values(parts).filter((part) => part && part.weight > 0).length : 0} of 6
          </dd>
        </div>
      </dl>

      {parts ? (
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Confidence signal breakdown</caption>
          <thead className="font-mono text-[12px] text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 font-medium">
                Signal
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Measured
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Weight
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(CONFIDENCE_PART_LABELS) as ConfidencePartId[]).map((id) => {
              const part = parts[id];
              const unused = !part || part.weight === 0;
              return (
                <tr key={id} className="border-t border-hairline">
                  <td className="py-2 text-ink">{CONFIDENCE_PART_LABELS[id]}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-body">
                    {unused ? (
                      <span className="text-muted-soft">Not measured</span>
                    ) : (
                      `${Math.round(part.raw * 100)}%`
                    )}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-body">
                    {unused ? "—" : `${part.weight.toFixed(1)}%`}
                  </td>
                  <td className="py-2 text-right font-mono tabular-nums text-ink">
                    {unused ? "—" : part.points.toFixed(1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
