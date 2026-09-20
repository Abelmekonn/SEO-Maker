import { type OpportunityBand, opportunityBandLabels } from "@seo-maker/core/scoring";
import { cn } from "@/lib/utils";

export type OpportunityRow = {
  id: string;
  title: string;
  competitorCount: number;
  competitorsTotal: number;
  selfCoverage: number | null;
  score: number;
  band: string;
};

const bandClass: Record<string, string> = {
  critical: "bg-bad/15 text-bad",
  high: "bg-warn/15 text-warn",
  medium: "bg-primary/15 text-primary",
  low: "bg-surface-card text-muted-foreground",
};

export function ContentOpportunities({
  rows,
  competitorsAnalyzed,
}: {
  rows: OpportunityRow[];
  competitorsAnalyzed: number;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          Content opportunities
        </h2>
        {rows.length > 0 ? (
          <span className="font-mono text-[12px] text-muted-foreground">
            {rows.length} found
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm leading-6 text-body">
          {competitorsAnalyzed < 2
            ? "Gap detection compares topic coverage across your competitors. Analyze at least two to see where they overlap and you do not."
            : "No significant content gaps were detected from the competitors analyzed so far."}
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Content gaps ranked by opportunity score</caption>
          <thead className="font-mono text-[12px] text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 font-medium">
                Topic
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Competitors
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                You
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Opportunity
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Priority
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const band = row.band as OpportunityBand;
              return (
                <tr key={row.id} className="border-t border-hairline">
                  <td className="max-w-[240px] py-2.5">
                    <p className="truncate text-ink">{row.title}</p>
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-body">
                    {row.competitorCount}/{row.competitorsTotal}
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-body">
                    {row.selfCoverage == null
                      ? "—"
                      : `${Math.round(row.selfCoverage * 100)}%`}
                  </td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex min-w-[34px] justify-center rounded-full bg-surface-card px-2 py-0.5 font-mono text-[12px] tabular-nums text-ink">
                      {Math.round(row.score)}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 font-mono text-[11px]",
                        bandClass[band] ?? bandClass.low,
                      )}
                    >
                      {opportunityBandLabels[band] ?? band}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
