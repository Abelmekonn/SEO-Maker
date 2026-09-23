/**
 * Copy for project screens that Free does not include. Free keeps the
 * homepage audit (Overview, Pages, Performance); everything here needs a paid plan.
 */
export const premiumFeatures = {
  competitors: {
    title: "Competitors",
    body: "See which sites compete with you in search and where their pages outperform yours.",
    unlocks: [
      "Competitors found from your search queries, or added by hand",
      "Side-by-side SEO scores for your site and theirs",
      "Content gaps: pages they have that you do not",
    ],
  },
  opportunities: {
    title: "Opportunities",
    body: "Ranked opportunities to grow traffic, built from your crawl and your competitors.",
    unlocks: [
      "Opportunities scored by impact and effort",
      "Gaps pulled from competitor pages",
      "Every page on your site, not only the homepage",
    ],
  },
  suggestions: {
    title: "AI Suggestions",
    body: "Plain-language explanations of each problem and what to change, grounded in the SEO knowledge base.",
    unlocks: [
      "Why each problem matters, page by page",
      "Drafted titles, meta descriptions and fixes",
      "Suggestions for every crawled page",
    ],
  },
  tools: {
    title: "Tools",
    body: "Workflow tools for fixing what the crawl finds across your whole site.",
    unlocks: [
      "Bulk fixes across crawled pages",
      "Scoped PageSpeed runs on the pages you choose",
      "Exports of every problem with its evidence",
    ],
  },
  reports: {
    title: "Reports",
    body: "Shareable reports of every problem, its evidence and its fix.",
    unlocks: [
      "Full-site audit reports",
      "Before and after comparisons between crawls",
      "Exact evidence for each problem",
    ],
  },
} as const;

export type PremiumFeature = keyof typeof premiumFeatures;
