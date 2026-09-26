import type { CompetitorViewState } from "@seo-maker/core/competitors";
import { Lock, Search, Swords } from "lucide-react";

const COPY: Partial<
  Record<CompetitorViewState, { icon: typeof Swords; title: string; body: string }>
> = {
  "not-analyzed": {
    icon: Swords,
    title: "Find out who you are competing with",
    body: "Press Discover Competitor to find the site that shows up most in the searches your customers make, measure how strongly it competes, and see where the gaps are. Or add a competitor you already know below.",
  },
  "no-results": {
    icon: Search,
    title: "No competitor found",
    body: "No domain recurred across your searches often enough to count as a competitor. Try regenerating your search keywords, or add a competitor you know about directly.",
  },
  "no-provider": {
    icon: Lock,
    title: "Automatic discovery needs a search provider",
    body: "Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to let SEO Maker find competitors from live search results. Until then you can add competitors manually and get the full crawl, scoring and comparison.",
  },
};

export function CompetitorEmptyState({ state }: { state: CompetitorViewState }) {
  const copy = COPY[state];
  if (!copy) return null;
  const Icon = copy.icon;

  return (
    <section className="flex flex-col items-start gap-3 rounded-xl bg-surface-soft p-8 ring-1 ring-hairline">
      <span className="flex size-10 items-center justify-center rounded-full bg-surface-card text-body ring-1 ring-hairline">
        <Icon className="size-4" aria-hidden />
      </span>
      <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
        {copy.title}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-body">{copy.body}</p>
    </section>
  );
}
