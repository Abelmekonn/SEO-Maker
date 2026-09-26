import { planLimits } from "@seo-maker/core/plan";

/**
 * Plan cards and the comparison table.
 *
 * Numbers are read from the plan table the server enforces
 * (@seo-maker/core/plan), so a card can never promise more, or less, than
 * the product gives. Plans are page counts, not prices. Nothing here
 * mentions tokens or AI cost: those are the owner's concern.
 */

const free = planLimits.free;
const pro = planLimits.pro;
const agency = planLimits.agency;

export type PricingTier = {
  name: string;
  price: string;
  cadence: string;
  body: string;
  featured: boolean;
  badge: string | null;
  cta: string;
  features: readonly string[];
  /** Shown crossed out, so a plan's limits are as clear as what it includes. */
  excluded: readonly string[];
};

export const pricingTiers: readonly PricingTier[] = [
  {
    name: "Free",
    price: "1 page",
    cadence: "Your homepage",
    body: "The whole product on your homepage: the real analysis, performance and AI, not a preview.",
    featured: false,
    badge: null,
    cta: "Get started",
    features: [
      "1-page crawl: your homepage",
      "Quick Search",
      "Deep Analysis",
      "Performance analysis",
      "Page AI on your homepage",
      `${free.aiDailyLimit} AI recommendations a day`,
      `${free.aiWeeklyLimit} AI recommendations a week`,
      `${free.recrawlsPerSite} re-crawl`,
    ],
    excluded: ["Site AI", "Competitor AI"],
  },
  {
    name: "Pro",
    price: `${pro.maxPages} pages`,
    cadence: "Per site",
    body: "Every page of your site, with AI on all of them and competitors to compare against.",
    featured: true,
    badge: "Popular",
    cta: "Start a project",
    features: [
      `${pro.maxPages}-page crawl, all Priority`,
      "Quick Search and Deep Analysis",
      "Page AI on every page",
      "Site AI: strategy and opportunities",
      "Competitor AI",
      `${pro.maxCompetitors} competitors`,
      "PageSpeed on the pages you choose",
      "Unlimited re-crawls",
    ],
    excluded: [],
  },
  {
    name: "Agency",
    price: `${agency.maxPages} pages`,
    cadence: "Per site",
    body: "Larger sites and many of them, with every AI capability.",
    featured: false,
    badge: null,
    cta: "Start a project",
    features: [
      `${agency.maxPages}-page crawl, up to ${agency.priorityPages} Priority pages`,
      `${agency.maxProjects} sites`,
      "Page, Site and Competitor AI",
      `${agency.maxCompetitors} competitors`,
      "Batch performance",
      "Unlimited re-crawls",
    ],
    excluded: [],
  },
];

type Cell = string | boolean;

export const pricingCompare: ReadonlyArray<{ label: string; values: readonly [Cell, Cell, Cell] }> = [
  { label: "Pages per crawl", values: ["1 (homepage)", String(pro.maxPages), String(agency.maxPages)] },
  { label: "Priority pages (full content)", values: [String(free.priorityPages), String(pro.priorityPages), String(agency.priorityPages)] },
  { label: "Sites", values: [String(free.maxProjects), String(pro.maxProjects), String(agency.maxProjects)] },
  { label: "Quick Search", values: [true, true, true] },
  { label: "Deep Analysis", values: [true, true, true] },
  { label: "Performance analysis", values: ["Homepage", "Selected pages", "Batch"] },
  { label: "Page AI", values: ["Homepage", "Every page", "Every page"] },
  {
    label: "AI recommendations",
    values: [`${free.aiDailyLimit} a day, ${free.aiWeeklyLimit} a week`, "No daily cap", "No daily cap"],
  },
  { label: "Site AI", values: [free.siteAi, pro.siteAi, agency.siteAi] },
  { label: "Competitor AI", values: [free.competitorAi, pro.competitorAi, agency.competitorAi] },
  { label: "Competitors tracked", values: [false, String(pro.maxCompetitors), String(agency.maxCompetitors)] },
  { label: "Re-crawls per site", values: [String(free.recrawlsPerSite), "Unlimited", "Unlimited"] },
];
