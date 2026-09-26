/**
 * Search queries: the few searches a potential customer would actually make.
 *
 * A model proposes them from the business profile; this decides which
 * survive. The rules are deterministic so they can be tested and so a
 * model can never smuggle a keyword list, a brand search or a duplicate
 * into the set every competitor is measured against.
 */

import { type Market, resolveMarket } from "./market";

export const SEARCH_QUERY_INTENTS = ["commercial", "transactional", "informational"] as const;
export type SearchQueryIntent = (typeof SEARCH_QUERY_INTENTS)[number];

export const SEARCH_QUERY_PRIORITIES = ["high", "medium", "low"] as const;
export type SearchQueryPriority = (typeof SEARCH_QUERY_PRIORITIES)[number];

/** The set is kept small on purpose: 5-12 searches that matter, never a keyword dump. */
export const MAX_SEARCH_QUERIES = 12;
export const TARGET_MIN_SEARCH_QUERIES = 5;
/** Fewer than this surviving means the generation failed. */
export const MIN_SEARCH_QUERIES = 3;

export type GeneratedSearchQuery = {
  query: string;
  intent: SearchQueryIntent;
  priority: SearchQueryPriority;
  reason: string;
};

export type RawSearchQuery = {
  query: string;
  intent: string;
  priority: string;
  reason: string;
};

const MIN_LENGTH = 3;
const MAX_LENGTH = 80;
const MIN_WORDS = 2;
const MAX_WORDS = 8;
const PRIORITY_RANK: Record<SearchQueryPriority, number> = { high: 0, medium: 1, low: 2 };
const FILLER = new Set(["a", "an", "and", "for", "in", "of", "on", "or", "the", "to", "with", "near", "me", "best", "top", "vs"]);

/** "  \"Payment Gateway For SaaS?\" " -> "payment gateway for saas" */
export function normalizeSearchQuery(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”"'`]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!;:,]+$/g, "")
    .trim()
    .toLowerCase();
}

function tokens(query: string): string[] {
  return query.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Same words in any order: "saas payment gateway" and "payment gateway saas" are one search. */
function identity(query: string): string {
  return [...new Set(tokens(query).filter((word) => !FILLER.has(word)))].sort().join(" ");
}

/** The words that name the business itself, from its name and its domain. */
export function brandTerms(input: { businessName?: string | null; domain?: string | null }): string[] {
  const names = new Set<string>();
  const add = (value: string | null | undefined) => {
    const text = normalizeSearchQuery(value ?? "");
    if (text.length >= 3) names.add(text);
  };
  add(input.businessName);
  if (input.domain) {
    const label = input.domain.toLowerCase().replace(/^www\./, "").split(".")[0];
    add(label);
  }
  return [...names];
}

function containsPhrase(query: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(query);
}

export type SanitizedQueries = {
  kept: GeneratedSearchQuery[];
  dropped: Array<{ query: string; reason: string }>;
};

/**
 * Keeps the searches worth checking:
 *
 *   - 3-80 characters and 2-8 words, one search rather than a list
 *   - no word repeated (keyword stuffing)
 *   - not a search for your own brand, which only finds your own site
 *   - a supported intent (commercial, transactional, informational) and priority
 *   - no duplicate, including the same words in another order
 *
 * High priority first, at most `max` (12).
 */
export function sanitizeSearchQueries(
  raw: RawSearchQuery[],
  options: { brandTerms?: string[]; max?: number } = {},
): SanitizedQueries {
  const max = Math.min(options.max ?? MAX_SEARCH_QUERIES, MAX_SEARCH_QUERIES);
  const brands = (options.brandTerms ?? []).map(normalizeSearchQuery).filter((term) => term.length >= 3);
  const kept: GeneratedSearchQuery[] = [];
  const dropped: SanitizedQueries["dropped"] = [];
  const seen = new Set<string>();

  for (const row of raw) {
    const query = normalizeSearchQuery(typeof row.query === "string" ? row.query : "");
    const intent = String(row.intent ?? "").trim().toLowerCase();
    const priority = String(row.priority ?? "").trim().toLowerCase();
    const words = tokens(query);
    const drop = (reason: string) => dropped.push({ query: query || String(row.query ?? ""), reason });

    if (query.length < MIN_LENGTH) {
      drop("empty or too short");
      continue;
    }
    if (query.length > MAX_LENGTH || words.length > MAX_WORDS) {
      drop("too long to be one search");
      continue;
    }
    if (words.length < MIN_WORDS) {
      drop("a single word is too broad");
      continue;
    }
    if (/[|,;\n]/.test(row.query ?? "")) {
      drop("a list of keywords, not a search");
      continue;
    }
    const content = words.filter((word) => !FILLER.has(word));
    if (new Set(content).size < content.length) {
      drop("repeats a word (keyword stuffing)");
      continue;
    }
    if (brands.some((brand) => containsPhrase(query, brand))) {
      drop("searches for your own brand");
      continue;
    }
    if (!(SEARCH_QUERY_INTENTS as readonly string[]).includes(intent)) {
      drop(`unsupported intent "${intent || "none"}"`);
      continue;
    }
    if (!(SEARCH_QUERY_PRIORITIES as readonly string[]).includes(priority)) {
      drop(`unsupported priority "${priority || "none"}"`);
      continue;
    }
    const key = identity(query);
    if (!key || seen.has(key)) {
      drop("duplicate");
      continue;
    }
    seen.add(key);
    kept.push({
      query,
      intent: intent as SearchQueryIntent,
      priority: priority as SearchQueryPriority,
      reason: (typeof row.reason === "string" ? row.reason : "").replace(/\s+/g, " ").trim().slice(0, 240),
    });
  }

  const ordered = kept
    .map((row, index) => ({ row, index }))
    .sort((a, b) => PRIORITY_RANK[a.row.priority] - PRIORITY_RANK[b.row.priority] || a.index - b.index)
    .map(({ row }) => row);
  for (const row of ordered.slice(max)) dropped.push({ query: row.query, reason: `over the limit of ${max}` });
  return { kept: ordered.slice(0, max), dropped };
}

// ------------------------------------------------------------------ profile

/** The business profile discovery and query generation read. */
export type DiscoveryProfile = {
  name: string | null;
  businessType: string | null;
  industry: string | null;
  businessDescription: string | null;
  targetAudience: string | null;
  targetLocation: string | null;
  servicesProducts: string[];
};

export type ProfileField = "businessType" | "targetLocation" | "targetAudience" | "servicesProducts" | "businessDescription";

export type ProfileGap = { field: ProfileField; label: string; hint: string };

/**
 * What the profile still lacks before competitors can be searched for.
 *
 * The target location has to name a country: search results differ by
 * country, and the United States is never assumed. A global business names
 * the market that matters most, e.g. "Global (mainly United States)".
 */
export function discoveryProfileGaps(profile: DiscoveryProfile, market: Market = resolveMarket(profile.targetLocation)): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!profile.businessType?.trim() && !profile.industry?.trim()) {
    gaps.push({ field: "businessType", label: "Business type", hint: "What kind of business this is, e.g. SaaS, agency, dental clinic, online shop." });
  }
  if (!market.country) {
    gaps.push({
      field: "targetLocation",
      label: "Target location or market",
      hint: !profile.targetLocation?.trim()
        ? "The country whose searches matter to you, e.g. United Kingdom or Addis Ababa, Ethiopia."
        : market.scope === "global"
          ? 'For a business that sells worldwide, name the country that matters most, e.g. "Global (mainly United States)".'
          : `"${profile.targetLocation}" does not name a country we recognise. Add the country, e.g. "Addis Ababa, Ethiopia".`,
    });
  }
  if (!profile.targetAudience?.trim()) {
    gaps.push({ field: "targetAudience", label: "Target audience", hint: "Who buys from you, e.g. finance teams at mid-sized online retailers." });
  }
  if (profile.servicesProducts.filter((item) => item.trim()).length === 0) {
    gaps.push({ field: "servicesProducts", label: "Main services or products", hint: "What you sell, comma separated." });
  }
  if (!profile.businessDescription?.trim()) {
    gaps.push({ field: "businessDescription", label: "Business description", hint: "Two or three sentences about what the business does." });
  }
  return gaps;
}

/**
 * A Google search for exactly this query, for the user to look at
 * themselves. Opened in their browser; SEO Maker never fetches it.
 */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`;
}
