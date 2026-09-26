import { type ConfidenceBand, type StoredConfidence, confidenceBandLabels } from "@seo-maker/core/scoring";
import { Info } from "lucide-react";
import Link from "next/link";
import { CompetitorGauge } from "@/components/project/CompetitorGauge";

/**
 * Headline confidence for the strongest competitor, with the definition kept
 * next to the number so it can never be mistaken for an SEO score.
 */
export function CompetitorConfidencePanel({
  projectId,
  competitorId,
  domain,
  confidence,
  band,
  breakdown,
}: {
  projectId: string;
  competitorId: string | null;
  domain: string | null;
  confidence: number | null;
  band: string | null;
  breakdown: StoredConfidence | null;
}) {
  const typedBand = (band ?? null) as ConfidenceBand | null;
  const searchSignal = breakdown?.signals.find((signal) => signal.id === "queryCoverage");

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex items-center gap-1.5">
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          Competitor confidence
        </h2>
        <Info className="size-3.5 text-muted-soft" aria-hidden />
      </div>

      <div className="flex flex-col items-center gap-3">
        <CompetitorGauge
          value={confidence}
          label={domain ? `${domain} competitor confidence` : "Competitor confidence"}
          caption={typedBand ? confidenceBandLabels[typedBand] : undefined}
        />
        {domain ? (
          <p className="text-center font-mono text-[12px] text-muted-foreground">{domain}</p>
        ) : null}
        {breakdown ? (
          <p className="text-center font-mono text-[12px] text-muted-foreground">
            Signals measured {breakdown.measuredSignalCount} of {breakdown.totalSignalCount}
          </p>
        ) : null}
      </div>

      <p className="text-sm leading-6 text-body">
        Measures how strongly this domain competes with your website, from shared searches, observed
        positions, search relevance, business similarity and market overlap.
      </p>

      {confidence == null && breakdown?.reason ? (
        <p className="rounded-lg bg-canvas p-3 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">{breakdown.reason}</p>
      ) : null}
      {confidence != null && breakdown?.basis === "business" && searchSignal?.reason ? (
        <p className="rounded-lg bg-canvas p-3 text-[12px] leading-5 text-muted-soft ring-1 ring-hairline">
          Based on business and market evidence. Search overlap is not measured: {searchSignal.reason}
        </p>
      ) : null}

      {competitorId ? (
        <Link
          href={`/projects/${projectId}/competitors/${competitorId}`}
          className="font-mono text-[12px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          How it is calculated →
        </Link>
      ) : null}
    </section>
  );
}
