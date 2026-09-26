/**
 * Why a competitor is visible, in plain sentences, with observation and
 * interpretation kept apart.
 *
 *   observed      what the checked searches and the crawl recorded, and nothing else
 *   opportunities what you could do about a specific observed difference;
 *                 never a promise that doing it will change a ranking
 *
 * Deterministic: built from stored evidence each time it is shown, so it
 * can never drift from the evidence behind it.
 */

import type { CompetitorComparison } from "./compare";
import type { SearchEvidenceSummary } from "./evidence";

export type CompetitorFinding = {
  kind: "search" | "pages" | "content" | "technical";
  text: string;
};

export type CompetitorOpportunity = {
  text: string;
  /** The comparison fact it rests on. */
  factId: string;
};

export type CompetitorFindings = {
  observed: CompetitorFinding[];
  opportunities: CompetitorOpportunity[];
};

const MAX_OPPORTUNITIES = 5;

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function describeCompetitorFindings(input: {
  domain: string;
  search: SearchEvidenceSummary | null;
  pages: Array<{ url: string; pageType: string | null; indexable: boolean | null; schemaTypes: string[] }>;
  comparison: CompetitorComparison | null;
}): CompetitorFindings {
  const { domain, search } = input;
  const observed: CompetitorFinding[] = [];

  if (search && search.queriesChecked > 0) {
    observed.push({
      kind: "search",
      text: `${domain} appears in ${search.appearanceCount} of ${plural(search.queriesChecked, "analyzed search", "analyzed searches")}.`,
    });
    if (search.appearanceCount > 0) {
      observed.push({
        kind: "search",
        text: `${search.top3} of those results ${search.top3 === 1 ? "is" : "are"} in the top 3 and ${search.top10} in the top 10 (best position #${search.bestPosition}).`,
      });
      if (search.sharedQueryCount > 0) {
        observed.push({ kind: "search", text: `Your site appears in ${plural(search.sharedQueryCount, "of the same searches", "of the same searches")} too.` });
      }
      const ranking = new Map<string, { position: number; query: string }>();
      for (const row of search.rows) {
        const path = pathOf(row.url);
        if (!ranking.has(path)) ranking.set(path, { position: row.position, query: row.query });
      }
      for (const [path, row] of [...ranking].slice(0, 3)) {
        observed.push({ kind: "search", text: `Its page ${path} appears at #${row.position} for "${row.query}".` });
      }
    }
  }

  if (input.pages.length > 0) {
    const types = new Map<string, number>();
    for (const page of input.pages) {
      const type = page.pageType ?? "other";
      types.set(type, (types.get(type) ?? 0) + 1);
    }
    const breakdown = [...types]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, count]) => plural(count, `${type} page`))
      .join(", ");
    observed.push({ kind: "pages", text: `${plural(input.pages.length, "page")} analyzed: ${breakdown}.` });

    const schema = new Map<string, number>();
    for (const page of input.pages) for (const type of new Set(page.schemaTypes)) schema.set(type, (schema.get(type) ?? 0) + 1);
    const topSchema = [...schema].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);
    if (topSchema.length > 0) {
      observed.push({
        kind: "content",
        text: `Structured data on its analyzed pages: ${topSchema.map(([type, count]) => `${type} (${count})`).join(", ")}.`,
      });
    }
    const noindex = input.pages.filter((page) => page.indexable === false).length;
    if (noindex > 0) {
      observed.push({ kind: "technical", text: `${plural(noindex, "analyzed page")} ${noindex === 1 ? "is" : "are"} not indexable.` });
    }
  }

  const opportunities: CompetitorOpportunity[] = [];
  for (const fact of input.comparison?.facts ?? []) {
    if (opportunities.length >= MAX_OPPORTUNITIES) break;
    if (fact.favours !== "competitor") continue;
    const example = fact.urls[0] ? pathOf(fact.urls[0]) : null;
    if (fact.kind === "page-type") {
      const type = fact.id.replace(/^pt:/, "");
      opportunities.push({
        factId: fact.id,
        text: `${domain} has a dedicated ${type} page${example ? ` (${example})` : ""}; your site has no equivalent among its crawled pages. If it fits what you offer, consider a ${type} page of your own.`,
      });
    } else if (fact.kind === "topic") {
      const gap = input.comparison?.topicGaps.find((row) => row.factId === fact.id);
      opportunities.push({
        factId: fact.id,
        text: `${domain} covers "${gap?.topic ?? "a topic"}"${example ? ` on ${example}` : ""}, which none of your crawled pages covers. If your customers need it, cover it on an existing page or a new one.`,
      });
    } else if (fact.kind === "keyword") {
      opportunities.push({
        factId: fact.id,
        text: `${fact.statement} Review which of your pages should answer that search.`,
      });
    }
  }

  return { observed, opportunities };
}
