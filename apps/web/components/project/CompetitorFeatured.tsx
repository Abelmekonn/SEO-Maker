import {
  CONFIDENCE_PART_LABELS,
  type ConfidencePartId,
  type SeoDimensionId,
  seoScoreBand,
  seoScoreBandLabels,
} from "@seo-maker/core/scoring";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { CompetitorGauge } from "@/components/project/CompetitorGauge";

type Part = { raw: number; weight: number; points: number };

/**
 * The single strongest competitor, with the evidence behind its confidence
 * score spelled out. "Why they're a competitor" reads straight from the scored
 * sub-signals, so the reasoning shown is the reasoning used.
 */
export function CompetitorFeatured({
  projectId,
  competitorId,
  domain,
  name,
  seoScore,
  pageCount,
  avgWordCount,
  schemaCoverage,
  parts,
  dimensions,
}: {
  projectId: string;
  competitorId: string;
  domain: string;
  name: string | null;
  seoScore: number | null;
  pageCount: number;
  avgWordCount: number | null;
  schemaCoverage: number | null;
  parts: Partial<Record<ConfidencePartId, Part>> | null;
  dimensions: Partial<Record<SeoDimensionId, number | null>>;
}) {
  const band = seoScore == null ? null : seoScoreBand(seoScore);

  const evidence = parts
    ? (Object.keys(CONFIDENCE_PART_LABELS) as ConfidencePartId[]).map((id) => ({
        id,
        label: CONFIDENCE_PART_LABELS[id],
        part: parts[id],
      }))
    : [];

  const measured = evidence.filter((row) => row.part && row.part.weight > 0);
  const unmeasured = evidence.filter((row) => !row.part || row.part.weight === 0);

  return (
    <section className="grid gap-5 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)]">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-[12px] text-muted-foreground">Featured competitor</p>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-card ring-1 ring-hairline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
              alt=""
              width={20}
              height={20}
              className="size-5"
            />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
              {domain}
            </p>
            {name ? <p className="truncate text-[12px] text-muted-foreground">{name}</p> : null}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Fact label="Pages" value={String(pageCount)} />
          <Fact
            label="Avg words"
            value={avgWordCount == null ? "n/a" : String(Math.round(avgWordCount))}
          />
          <Fact
            label="Schema"
            value={schemaCoverage == null ? "n/a" : `${Math.round(schemaCoverage * 100)}%`}
          />
        </dl>

        <Link
          href={`/projects/${projectId}/competitors/${competitorId}`}
          className="inline-flex h-10 w-fit items-center rounded-md bg-surface-card px-3 font-mono text-[12px] text-ink ring-1 ring-hairline hover:bg-surface-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View comparison
        </Link>
      </div>

      <div className="flex flex-col items-center justify-center gap-2">
        <CompetitorGauge
          value={seoScore}
          label={`${domain} SEO score`}
          size={128}
          strokeWidth={10}
        />
        <p className="font-mono text-[12px] text-muted-foreground">
          SEO score{band ? ` · ${seoScoreBandLabels[band]}` : ""}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-mono text-[12px] text-muted-foreground">Why they are a competitor</p>
        {measured.length === 0 ? (
          <p className="text-sm leading-6 text-body">
            We have not collected search evidence for this domain yet. Run discovery with a search
            provider configured to measure how often you compete for the same queries.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {measured.map((row) => (
              <li key={row.id} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                <span className="text-body">
                  {row.label}
                  <span className="ml-1 font-mono text-[12px] tabular-nums text-ink">
                    {Math.round((row.part?.raw ?? 0) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {unmeasured.length > 0 ? (
          <ul className="flex flex-col gap-1.5 border-t border-hairline pt-3">
            {unmeasured.map((row) => (
              <li key={row.id} className="flex items-start gap-2 text-[12px] text-muted-soft">
                <Minus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {row.label} — not measured
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-[11px] leading-5 text-muted-soft">
          Signals we could not measure are excluded from the score rather than counted as zero.
        </p>
        <span className="sr-only">
          {Object.entries(dimensions)
            .filter(([, value]) => value != null)
            .map(([key, value]) => `${key} ${value}`)
            .join(", ")}
        </span>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-canvas p-2.5 ring-1 ring-hairline">
      <dt className="font-mono text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm tabular-nums text-ink">{value}</dd>
    </div>
  );
}
