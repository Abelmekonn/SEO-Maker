import type { ReactNode } from "react";
import type { CompetitorInsight } from "@seo-maker/ai/schemas";
import type { CompetitorComparison, CompetitorFact } from "@seo-maker/core/competitors";
import { Eye, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A competitor comparison, facts beside interpretation (Phase 4.1, 4.2).
 *
 * Every fact was observed by code in the two crawls and is labelled
 * "Observed". The AI's reading of a fact sits under it, labelled as
 * interpretation, and only ever refers to a fact shown here. A gap's
 * "worth pursuing" is a judgement, and without business context it is never
 * a yes: a competitor having a page is not proof your site needs one.
 */

const WORTH: Record<CompetitorInsight["gaps"][number]["worthPursuing"], { label: string; className: string }> = {
  yes: { label: "Worth pursuing", className: "bg-good/10 text-good" },
  maybe: { label: "Maybe", className: "bg-warn/10 text-warn" },
  no: { label: "Probably not", className: "bg-surface-card text-muted-foreground" },
};

export function CompetitorGaps({
  domain,
  comparison,
  insight,
  insightMeta,
  action,
}: {
  domain: string;
  comparison: CompetitorComparison | null;
  insight: CompetitorInsight | null;
  insightMeta: string | null;
  /** The explain button, rendered by the page. */
  action: ReactNode;
}) {
  if (!comparison) {
    return (
      <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">Gaps and insights</h2>
        <p className="text-sm leading-6 text-body">
          The comparison appears once this competitor&apos;s analysis has finished and your own site has a complete crawl.
        </p>
      </section>
    );
  }

  const interpretations = new Map<string, string>();
  for (const row of [...(insight?.strengths ?? []), ...(insight?.weaknesses ?? [])]) interpretations.set(row.factId, row.interpretation);
  const gaps = new Map((insight?.gaps ?? []).map((gap) => [gap.factId, gap]));
  const theirs = comparison.facts.filter((fact) => fact.favours === "competitor");
  const yours = comparison.facts.filter((fact) => fact.favours === "self");

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">What differs, and what it may mean</h2>
          {insight ? (
            <>
              <p className="flex items-center gap-1.5 font-mono text-[12px] text-primary">
                <Sparkles className="size-3.5" aria-hidden />
                Interpretation, written by AI from the observed facts below
              </p>
              <p className="text-sm leading-6 text-body">{insight.summary}</p>
              {insightMeta ? <p className="font-mono text-[11px] text-muted-foreground">{insightMeta}</p> : null}
            </>
          ) : (
            <p className="text-sm leading-6 text-body">
              {comparison.facts.length} observed differences between your site and {domain}, from both crawls. Ask the AI
              what they may mean for your site; the facts stay as observed either way.
            </p>
          )}
          <ul className="mt-1 flex flex-col gap-1">
            {comparison.limits.map((limit) => (
              <li key={limit} className="text-xs leading-5 text-muted-foreground">
                {limit}
              </li>
            ))}
          </ul>
        </div>
        {action}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <FactList title={`Where ${domain} is ahead`} facts={theirs} interpretations={interpretations} gaps={gaps} empty="No observed advantage." />
        <FactList title="Where you are ahead" facts={yours} interpretations={interpretations} gaps={gaps} empty="No observed advantage." />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CompareTable
          title="Page types"
          head={["Type", "You", "Them"]}
          rows={comparison.pageTypes.map((row) => [row.type, row.self, row.competitor])}
        />
        <CompareTable
          title="Structured data"
          head={["schema.org type", "You", "Them"]}
          rows={comparison.schemaTypes.slice(0, 10).map((row) => [row.type, row.self, row.competitor])}
        />
        <CompareTable
          title="Average words, by page type"
          head={["Type", "You", "Them"]}
          rows={comparison.depth.map((row) => [row.pageType, row.selfAvgWords, row.competitorAvgWords])}
        />
      </div>

      {comparison.topicGaps.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <h3 className="font-display text-[16px] leading-6 tracking-[-0.2px] text-ink">Topics they cover that you do not</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Matched on the words in titles and headings. Your closest page is shown with the share of the topic&apos;s
            words it names.
          </p>
          <ul className="flex flex-col">
            {comparison.topicGaps.map((gap) => (
              <li key={gap.factId} className="flex flex-col gap-1 border-t border-hairline py-2.5 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{gap.topic}</span>
                  <a href={gap.url} target="_blank" rel="noreferrer noopener" className="block truncate font-mono text-[12px] text-muted-foreground hover:text-ink">
                    {gap.url}
                  </a>
                </span>
                <span className="shrink-0 font-mono text-[12px] text-body">
                  {gap.bestSelfMatch ? `yours: ${pathOf(gap.bestSelfMatch.url)} (${Math.round(gap.bestSelfMatch.score * 100)}%)` : "no page of yours"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function FactList({
  title,
  facts,
  interpretations,
  gaps,
  empty,
}: {
  title: string;
  facts: CompetitorFact[];
  interpretations: Map<string, string>;
  gaps: Map<string, CompetitorInsight["gaps"][number]>;
  empty: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <h3 className="font-display text-[16px] leading-6 tracking-[-0.2px] text-ink">{title}</h3>
      {facts.length === 0 ? (
        <p className="text-sm leading-6 text-body">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {facts.map((fact) => {
            const gap = gaps.get(fact.id);
            const reading = gap?.interpretation ?? interpretations.get(fact.id);
            return (
              <li key={fact.id} className="flex flex-col gap-2 rounded-lg bg-canvas/60 p-3 ring-1 ring-hairline">
                <p className="flex items-start gap-2 text-sm leading-6 text-ink">
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-card px-2 py-0.5 font-mono text-[10px] leading-4 text-body">
                    <Eye className="size-3" aria-hidden />
                    Observed
                  </span>
                  {fact.statement}
                </p>
                {reading ? (
                  <div className="flex flex-col gap-1.5 border-l-2 border-primary/40 pl-3">
                    <p className="text-sm leading-6 text-body">
                      <span className="font-mono text-[11px] text-primary">Interpretation · </span>
                      {reading}
                    </p>
                    {gap ? (
                      <>
                        <p className="text-sm leading-6 text-body">{gap.recommendation}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs leading-5 text-muted-foreground">
                          <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px]", WORTH[gap.worthPursuing].className)}>
                            {WORTH[gap.worthPursuing].label}
                          </span>
                          {gap.reason}
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CompareTable({ title, head, rows }: { title: string; head: [string, string, string]; rows: Array<[string, number, number]> }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <h3 className="font-display text-[16px] leading-6 tracking-[-0.2px] text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm leading-6 text-body">Nothing to compare.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead className="font-mono text-[12px] text-muted-foreground">
            <tr>
              <th scope="col" className="py-1.5 font-medium">{head[0]}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{head[1]}</th>
              <th scope="col" className="py-1.5 text-right font-medium">{head[2]}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, self, them]) => (
              <tr key={label} className="border-t border-hairline">
                <td className="max-w-[140px] truncate py-1.5 text-body">{label}</td>
                <td className={cn("py-1.5 text-right font-mono tabular-nums", self >= them ? "text-ink" : "text-body")}>{self}</td>
                <td className={cn("py-1.5 text-right font-mono tabular-nums", them > self ? "text-ink" : "text-body")}>{them}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
