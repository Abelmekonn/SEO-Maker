import Link from "next/link";
import type { GeoOpportunity } from "@seo-maker/db";
import {
  GEO_DIMENSION_LABELS,
  GEO_OPPORTUNITY_TYPE_LABELS,
  type GeoDimensionId,
  type GeoOpportunityType,
} from "@seo-maker/core/geo";
import { AlertTriangle, Gauge, ListChecks, Target, Zap } from "lucide-react";
import { MetricCard, Panel, SeverityBadge } from "@/components/project/geo/board-primitives";
import { cn } from "@/lib/utils";

/**
 * The GEO Opportunities board.
 *
 * Everything here is deterministic. The ranking is a weighted sum whose inputs
 * are stored on each row, so every card can show the arithmetic that produced
 * its own position — which is the point: a priority nobody can account for is
 * just a number with a colour.
 */

const PART_LABELS: Record<string, string> = {
  dimensionWeight: "Signal weight",
  currentGap: "Current gap",
  reach: "Pages affected",
  effort: "Ease of fix",
};

/** One hue, four steps: the parts are shares of one number, not four categories. */
const PART_TONES: Record<string, string> = {
  dimensionWeight: "bg-primary",
  currentGap: "bg-primary/70",
  reach: "bg-primary/45",
  effort: "bg-primary/25",
};

const EFFORT_LABELS: Record<string, string> = {
  low: "Quick fix",
  medium: "Some work",
  high: "Significant work",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

type Part = { raw: number; weight: number; points: number };

export function GeoOpportunitiesBoard({
  projectId,
  opportunities,
}: {
  projectId: string;
  opportunities: GeoOpportunity[];
}) {
  const open = opportunities.filter((row) => row.status === "open");
  const critical = open.filter((row) => row.severity === "critical").length;
  const quickWins = open.filter((row) => row.estimatedEffort === "low").length;
  const dimensions = new Set(open.map((row) => row.dimension).filter(Boolean));

  const bySeverity = SEVERITY_ORDER.map((severity) => ({
    severity,
    count: open.filter((row) => row.severity === severity).length,
  })).filter((entry) => entry.count > 0);

  const maxSeverityCount = Math.max(1, ...bySeverity.map((entry) => entry.count));

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Findings summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ListChecks}
          label="Open findings"
          value={open.length}
          hint="Things the analysis found worth changing"
        />
        <MetricCard
          icon={AlertTriangle}
          label="Critical"
          value={critical}
          tone={critical > 0 ? "bad" : "good"}
          hint="Blocking a crawler or a whole signal"
        />
        <MetricCard
          icon={Zap}
          label="Quick fixes"
          value={quickWins}
          tone={quickWins > 0 ? "good" : "default"}
          hint="Low effort, usually a config change"
        />
        <MetricCard
          icon={Gauge}
          label="Signals affected"
          value={`${dimensions.size} / 7`}
          hint="Readiness signals these findings sit under"
        />
      </section>

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {open.length === 0 ? (
            <Panel title="Findings">
              <div className="rounded-lg bg-canvas px-4 py-6 text-center ring-1 ring-hairline">
                <Target className="mx-auto size-5 text-muted-soft" aria-hidden />
                <p className="mt-2 text-[13px] font-medium text-ink">Nothing to fix</p>
                <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-muted-soft">
                  Every signal the analysis could measure passed. More findings become possible as
                  the remaining signals are implemented.
                </p>
              </div>
              <p className="text-[11px] leading-4 text-muted-soft">
                Only failures become findings. A check we could not read is a gap in our evidence,
                not a problem with your site, so it is never listed here.
              </p>
            </Panel>
          ) : (
            <ul className="flex flex-col gap-3">
              {open.map((row) => (
                <FindingCard key={row.id} row={row} projectId={projectId} />
              ))}
            </ul>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-4 xl:w-[320px] xl:shrink-0">
          <Panel title="By severity">
            {bySeverity.length === 0 ? (
              <p className="text-[12px] leading-5 text-muted-soft">No open findings.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {bySeverity.map((entry) => (
                  <li key={entry.severity} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <SeverityBadge severity={entry.severity} />
                      <span className="font-mono text-[12px] tabular-nums text-ink">
                        {entry.count}
                      </span>
                    </div>
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-card">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${(entry.count / maxSeverityCount) * 100}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="How priority is set">
            <p className="text-[12px] leading-5 text-muted-soft">
              A weighted sum of four measured inputs. No model produces it, and every card shows its
              own arithmetic.
            </p>
            <ul className="flex flex-col gap-2">
              {Object.entries(PART_LABELS).map(([key, label]) => (
                <li key={key} className="flex items-center gap-2.5">
                  <span className={cn("size-2 shrink-0 rounded-full", PART_TONES[key])} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{label}</span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-soft">
                    {key === "dimensionWeight"
                      ? "35"
                      : key === "currentGap"
                        ? "30"
                        : key === "reach"
                          ? "20"
                          : "15"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
              An input we could not measure is dropped and its weight spread across the rest, rather
              than counted as a zero.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function FindingCard({ row, projectId }: { row: GeoOpportunity; projectId: string }) {
  const evidence = (row.evidence ?? []) as Array<{ label: string; value: string; source: string }>;
  const urls = (row.affectedUrls ?? []) as string[];
  const parts = (row.priorityParts ?? {}) as Record<string, Part>;
  const contributing = Object.entries(parts).filter(([, part]) => part.points > 0);
  const total = contributing.reduce((sum, [, part]) => sum + part.points, 0);

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={row.severity} />
            <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
              {GEO_OPPORTUNITY_TYPE_LABELS[row.type as GeoOpportunityType] ?? row.type}
            </span>
            <span className="text-[11px] text-muted-soft">
              {EFFORT_LABELS[row.estimatedEffort] ?? row.estimatedEffort}
            </span>
            {!row.aiUsed ? (
              <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-medium leading-4 text-muted-soft">
                Rule-based
              </span>
            ) : null}
          </div>
          <h2 className="text-[15px] font-semibold leading-6 text-ink">{row.title}</h2>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-display text-[26px] leading-none tabular-nums text-ink">
            {Math.round(row.priority)}
          </p>
          <p className="mt-1 text-[11px] capitalize text-muted-soft">{row.priorityBand} priority</p>
        </div>
      </div>

      <p className="text-[13px] leading-6 text-body">{row.explanation}</p>

      <div className="rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline">
        <p className="text-[11px] uppercase tracking-wide text-muted-soft">What to do</p>
        <p className="mt-1 text-[13px] leading-6 text-ink">{row.recommendedAction}</p>
      </div>

      {/* The arithmetic behind the number on this card, from its stored parts. */}
      {contributing.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-soft">Why this ranks here</p>
          <span className="flex h-2 overflow-hidden rounded-full bg-surface-card">
            {contributing.map(([key, part]) => (
              <span
                key={key}
                className={cn("block h-full first:rounded-l-full last:rounded-r-full", PART_TONES[key])}
                style={{ width: `${(part.points / Math.max(1, total)) * 100}%` }}
              />
            ))}
          </span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {contributing.map(([key, part]) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className={cn("size-2 shrink-0 rounded-full", PART_TONES[key])} />
                <span className="text-[11px] text-muted-foreground">{PART_LABELS[key] ?? key}</span>
                <span className="font-mono text-[11px] tabular-nums text-muted-soft">
                  {Math.round(part.points)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {evidence.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-[11px] uppercase tracking-wide text-muted-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Evidence ({evidence.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {evidence.map((item) => (
              <li key={item.label} className="text-[12px] leading-5 text-muted-foreground">
                <span className="text-muted-soft">{item.label}:</span> {item.value}{" "}
                <span className="text-muted-soft">({item.source})</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {urls.length > 0 ? (
        <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
          Affects {urls.length} analyzed page{urls.length === 1 ? "" : "s"}
          {row.dimension
            ? ` · counts toward ${GEO_DIMENSION_LABELS[row.dimension as GeoDimensionId] ?? row.dimension}`
            : ""}
          {" · "}
          <Link
            href={`/projects/${projectId}/ai-search/readiness`}
            className="rounded-md text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            see readiness
          </Link>
        </p>
      ) : null}
    </li>
  );
}
