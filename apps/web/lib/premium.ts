import type { PlanLimits } from "@/lib/plan";

/**
 * Copy for project screens a plan may not include, and the capability each
 * one needs. Gates read the capability, not the plan name, so a plan change
 * in @seo-maker/core/plan moves every gate with it. The API enforces the same
 * capabilities; these screens only explain them.
 */
export const premiumFeatures = {
  performance: {
    title: "Performance",
    body: "Lighthouse lab scores and Core Web Vitals for the pages you choose, on mobile and desktop.",
    unlocks: [
      "PageSpeed runs on the pages you pick",
      "LCP, CLS, INP and TBT, with what slows each page down",
      "Score history for every page you test",
    ],
    allowed: (limits: PlanLimits) => limits.performance,
  },
  competitors: {
    title: "Competitors",
    body: "See which sites compete with you in search and where their pages outperform yours.",
    unlocks: [
      "Competitors found from your search queries, or added by hand",
      "Side-by-side SEO scores for your site and theirs",
      "Content gaps: pages they have that you do not",
    ],
    allowed: (limits: PlanLimits) => limits.maxCompetitors > 0,
  },
  opportunities: {
    title: "Opportunities",
    body: "Ranked opportunities to grow traffic, built from your crawl and your competitors.",
    unlocks: [
      "Opportunities scored by impact and effort",
      "Gaps pulled from competitor pages",
      "Every page on your site, not only the homepage",
    ],
    allowed: (limits: PlanLimits) => limits.siteAi,
  },
  suggestions: {
    title: "Page Analysis",
    body: "AI recommendations for a page, grounded in its crawl evidence and the SEO knowledge base.",
    unlocks: [
      "Why each problem matters, page by page",
      "Metadata, content, headings, schema, alt text and internal links",
      "Every crawled page",
    ],
    allowed: (limits: PlanLimits) => limits.ai,
  },
  "site-ai": {
    title: "Site Strategy",
    body: "AI strategy for the whole site, grounded in its Site Intelligence: what to write, how to organise it and how to link it.",
    unlocks: [
      "Content opportunities and a content strategy",
      "Topic structure and site architecture recommendations",
      "An internal-link strategy built from how your pages actually link",
    ],
    allowed: (limits: PlanLimits) => limits.siteAi,
  },
  "competitor-ai": {
    title: "Competitor Analysis",
    body: "AI comparison of your site with the competitors you track, from evidence collected on both sites.",
    unlocks: [
      "Side-by-side comparison, strengths and weaknesses",
      "Content and topic gaps, and structural differences",
      "Opportunities, with whether each is worth pursuing",
    ],
    allowed: (limits: PlanLimits) => limits.competitorAi,
  },
  tools: {
    title: "Tools",
    body: "Files built from what the crawl found, ready to publish.",
    unlocks: [
      "A sitemap.xml of your crawled, indexable pages",
      "robots.txt checked, with the exact lines to add",
      "Both files checked with the crawler's own parser",
    ],
    allowed: (limits: PlanLimits) => limits.analyzeStandardPages,
  },
  reports: {
    title: "Reports",
    body: "What your changes fixed, measured by crawling again.",
    unlocks: [
      "Before and after comparisons between crawls",
      "Which AI recommendations a re-crawl shows resolved",
      "How each site opportunity has moved since it was found",
    ],
    allowed: (limits: PlanLimits) => limits.analyzeStandardPages,
  },
} as const;

export type PremiumFeature = keyof typeof premiumFeatures;
