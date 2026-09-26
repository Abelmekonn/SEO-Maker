import {
  type ConfidenceBand,
  type ConfidenceSignal,
  type StoredConfidence,
  confidenceBandLabels,
  confidenceBandRating,
} from "@seo-maker/core/scoring";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const ratingText: Record<string, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-muted-foreground",
};

const BASIS_TEXT = {
  search: "Based on search evidence.",
  business: "Based on business and market evidence only: search overlap is not measured yet.",
} as const;

function basisText(breakdown: StoredConfidence): string | null {
  if (!breakdown.basis) return null;
  if (breakdown.basis === "business" && breakdown.cappedAt != null) {
    return `${BASIS_TEXT.business} Without search evidence the score is capped at ${breakdown.cappedAt}.`;
  }
  return BASIS_TEXT[breakdown.basis];
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** The measured value in words, from the evidence stored with the signal. */
export function signalEvidenceText(signal: ConfidenceSignal): string | null {
  const e = (signal.evidence ?? {}) as Record<string, unknown>;
  switch (signal.id) {
    case "queryCoverage": {
      const appearances = num(e.appearances);
      const checked = num(e.queriesChecked);
      if (appearances == null || checked == null) return null;
      const shared = num(e.sharedWithYou);
      return `Appears in ${appearances} of ${plural(checked, "search", "searches")} checked${shared != null ? `; you both appear in ${shared}` : ""}.`;
    }
    case "rankingVisibility": {
      const parts = [`Top 3: ${num(e.top3) ?? 0}`, `Top 10: ${num(e.top10) ?? 0}`, `Top 20: ${num(e.top20) ?? 0}`];
      if (num(e.bestPosition) != null) parts.push(`best #${num(e.bestPosition)}`);
      if (num(e.avgPosition) != null) parts.push(`average #${num(e.avgPosition)}`);
      return `Observed positions: ${parts.join(" · ")}.`;
    }
    case "queryRelevance": {
      const mean = num(e.meanRelevance);
      return mean == null ? null : `Mean relevance to your business ${Math.round(mean * 100)}% across the ${plural(num(e.searches) ?? 0, "search", "searches")} it appears in.`;
    }
    case "businessSimilarity": {
      const shared = list(e.sharedTerms);
      const basis = e.basis === "your-site" ? "your site's pages" : "your business profile";
      const types = typeof e.yourType === "string" && typeof e.theirType === "string" ? ` Business type: yours ${e.yourType}, theirs ${e.theirType}.` : "";
      return shared.length
        ? `Shares ${plural(num(e.sharedCount) ?? shared.length, "offering word")} with ${basis}: ${shared.slice(0, 8).join(", ")}.${types}`
        : `No offering words in common with ${basis}.${types}`;
    }
    case "locationSimilarity": {
      const detail = typeof e.detail === "string" ? e.detail : null;
      const theirs = [e.theirCountry, e.theirLanguage ? `language ${e.theirLanguage}` : null].filter(Boolean).join(", ");
      return [detail, theirs ? `Theirs: ${theirs}.` : null].filter(Boolean).join(" ") || null;
    }
    case "classificationConfidence": {
      if (typeof e.detail === "string" && e.source === "manual") return e.detail;
      const commercial = num(e.commercialPages);
      const pages = num(e.pagesAnalyzed);
      return commercial != null && pages != null ? `${commercial} of ${plural(pages, "analyzed page")} sell (homepage, service, product, pricing).` : null;
    }
  }
}

/**
 * Why a domain is a competitor: every confidence signal, measured with its
 * evidence, or not measured with the reason.
 *
 * This is what keeps Competitor Confidence from being read as an SEO score:
 * the reader sees exactly which evidence produced the number, the weight
 * each signal carried after redistribution, and why any signal is missing.
 */
export function CompetitorConfidenceCard({
  score,
  band,
  breakdown,
  domain,
  status,
}: {
  score: number | null;
  band: string | null;
  breakdown: StoredConfidence | null;
  domain: string;
  status: string;
}) {
  const typedBand = (band ?? null) as ConfidenceBand | null;
  const rating = typedBand ? confidenceBandRating[typedBand] : "none";
  const measuring = ["queued", "crawling", "analyzing"].includes(status);
  const signals = breakdown?.signals ?? [];
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const coverage = byId.get("queryCoverage");
  const visibility = byId.get("rankingVisibility");

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div>
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">Why this is a competitor</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-body">
          Competitor confidence measures how strongly {domain} competes with you in search. It is calculated from evidence, not
          an SEO score and not a prediction of rankings.
        </p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {score == null ? (
          <p className="text-sm text-muted-foreground">
            {measuring
              ? "Measuring. The signals appear when the analysis finishes."
              : !breakdown
                ? "Not measured yet. Analyze this competitor again to measure it."
                : (breakdown.reason ?? "Not enough evidence to score this competitor yet.")}
          </p>
        ) : (
          <>
            <p className={cn("font-display text-[36px] leading-none tracking-[-0.6px] tabular-nums", ratingText[rating])}>
              {Math.round(score)}
              <span className="text-[16px] text-muted-foreground"> / 100</span>
            </p>
            {typedBand ? <span className="font-mono text-[12px] text-muted-foreground">{confidenceBandLabels[typedBand]}</span> : null}
            {breakdown && basisText(breakdown) ? <p className="w-full text-[12px] leading-5 text-muted-foreground">{basisText(breakdown)}</p> : null}
          </>
        )}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <Tile
          label="Shared searches"
          signal={coverage}
          value={
            coverage?.measured && num(coverage.evidence?.appearances) != null
              ? `${num(coverage.evidence?.appearances)} of ${num(coverage.evidence?.queriesChecked) ?? 0}`
              : null
          }
        />
        <Tile
          label="Average position"
          signal={visibility}
          value={visibility?.measured && num(visibility.evidence?.avgPosition) != null ? `#${num(visibility.evidence?.avgPosition)}` : null}
        />
        <div className="rounded-lg bg-canvas p-3 ring-1 ring-hairline">
          <dt className="font-mono text-[12px] text-muted-foreground">Signals measured</dt>
          <dd className="mt-1 font-mono tabular-nums text-ink">
            {breakdown ? `${breakdown.measuredSignalCount} of ${breakdown.totalSignalCount}` : "—"}
          </dd>
        </div>
      </dl>

      {signals.length > 0 ? (
        <ul aria-label="Confidence signals" className="flex flex-col divide-y divide-hairline rounded-lg bg-canvas ring-1 ring-hairline">
          {signals.map((signal) => (
            <li key={signal.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex items-center gap-2 text-sm text-ink">
                  {signal.measured ? (
                    <Check className="size-4 shrink-0 text-good" aria-hidden />
                  ) : (
                    <Minus className="size-4 shrink-0 text-muted-soft" aria-hidden />
                  )}
                  {signal.label}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-body">
                  {signal.measured && signal.score != null ? (
                    <>
                      {Math.round(signal.score * 100)}%
                      <span className="text-muted-soft"> · weight {signal.appliedWeight.toFixed(1)}% · {signal.points.toFixed(1)} pts</span>
                    </>
                  ) : (
                    <span className="text-muted-soft">Not measured</span>
                  )}
                </span>
              </div>
              <p className="pl-6 text-[12px] leading-5 text-muted-foreground">
                {signal.measured ? (signalEvidenceText(signal) ?? "Measured.") : `Reason: ${signal.reason ?? "Not measured."}`}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {signals.length > 0 ? (
        <p className="text-[11px] leading-5 text-muted-soft">
          Signals that could not be measured are left out of the score, and their weight is spread over the measured ones. They
          are never counted as zero.
        </p>
      ) : null}
    </section>
  );
}

function Tile({ label, signal, value }: { label: string; signal: ConfidenceSignal | undefined; value: string | null }) {
  return (
    <div className="rounded-lg bg-canvas p-3 ring-1 ring-hairline">
      <dt className="font-mono text-[12px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono tabular-nums text-ink" title={!signal?.measured ? (signal?.reason ?? undefined) : undefined}>
        {value ?? <span className="text-muted-soft">Not measured</span>}
      </dd>
    </div>
  );
}
