/**
 * Search queries from the business profile.
 *
 *   business profile + target market + a few of the site's own page titles
 *     -> 5-12 searches a potential customer would actually make
 *     -> sanitizeSearchQueries (code): duplicates, brand searches, keyword
 *        lists and stuffing removed, at most 12 kept
 *
 * One feature, used twice: the "Generate Search Keywords" action and
 * automatic competitor discovery both call `generateSearchQueries`, which
 * runs this spec. The model proposes; it never supplies volumes, rankings or
 * relevance scores, and the product computes relevance itself.
 */

import {
  MAX_SEARCH_QUERIES,
  MIN_SEARCH_QUERIES,
  TARGET_MIN_SEARCH_QUERIES,
  sanitizeSearchQueries,
} from "@seo-maker/core/competitors";
import type { KnowledgeQuery } from "../knowledge";
import { type SearchQueriesOutput, searchQueriesSchema } from "../schemas";
import type { PageFeatureSpec } from "./page";

export const SEARCH_QUERIES_SYSTEM_PROMPT = [
  "You are the search research layer of an SEO tool. From a business profile, you list the searches a",
  "potential customer of this business would type into a search engine when looking for what it offers.",
  "",
  "Rules you must follow without exception:",
  `1. Return between ${TARGET_MIN_SEARCH_QUERIES} and ${MAX_SEARCH_QUERIES} searches. Fewer, better searches beat many: no long-tail variations,`,
  "   no synonyms of a search already listed, no keyword lists.",
  "2. Every search is about what the business sells, for the audience it serves. Use only the PROFILE given;",
  "   never invent a product, service, place or audience it does not state.",
  "3. Never include the business's own name or domain, or any competitor's brand name: those searches find",
  "   one company, not the market.",
  "4. Write each search the way a person types it: lower case, 2 to 8 words, no punctuation, no quotes.",
  "5. Mix what fits the business: core service searches, commercial searches (comparing or choosing a",
  "   provider), transactional searches (ready to buy or sign up), and problem/solution searches. Do not force",
  "   a kind that does not fit.",
  "6. Add a place name only where location matters: always for a local business (use its city or country),",
  "   sometimes for a business selling in one country, rarely for a global one.",
  "7. Write in the LANGUAGE given for the market.",
  "8. intent is commercial, transactional or informational. priority is high for the searches closest to what",
  "   the business sells, medium or low for the rest. reason says in one short sentence why a customer makes",
  "   this search. Never state search volumes, rankings or difficulty: you do not know them.",
  "9. In `groundedIn`, list the PROFILE fields you used.",
  "",
  "Respond with a single JSON object and no other text.",
].join("\n");

export type SearchQueryProfile = {
  site: { name: string; domain: string; language: string };
  business: {
    name: string | null;
    type: string | null;
    industry: string | null;
    description: string | null;
    audience: string | null;
    servicesProducts: string[];
    primaryGoal: string | null;
    /** The user's own keyword hints. */
    targetKeywords: string[];
  };
  market: { scope: "local" | "national" | "global" | "unknown"; country: string | null; location: string | null };
  /** A few of the site's page titles, to use its own vocabulary. */
  pages: Array<{ path: string; title: string | null; h1: string | null }>;
};

const MAX_PAGES = 8;

/** The feature spec. `brandTerms` are removed from the output by code, whatever the model does. */
export function searchQueriesSpec(profile: SearchQueryProfile, brandTerms: string[]): PageFeatureSpec<SearchQueriesOutput> {
  const evidence = {
    site: profile.site,
    business: profile.business,
    market: profile.market,
    pages: profile.pages.slice(0, MAX_PAGES),
  };
  // No knowledge retrieval: this is a business question, not an SEO rule.
  const knowledge: KnowledgeQuery = { applicability: [], limit: 0 };

  return {
    feature: "search-queries",
    schema: searchQueriesSchema,
    knowledge,
    evidence,
    maxTokens: 1800,
    temperature: 0.4,
    buildPrompt: () => ({
      system: SEARCH_QUERIES_SYSTEM_PROMPT,
      user: [
        "# PROFILE (the only facts you may use about the business)",
        JSON.stringify(evidence, null, 2),
        "",
        `# LANGUAGE\n${profile.site.language}`,
        "",
        "# TASK",
        `List ${TARGET_MIN_SEARCH_QUERIES}-${MAX_SEARCH_QUERIES} searches a potential customer of this business would make.`,
        "Return JSON: {",
        '  "queries": [{ "query": string, "intent": "commercial"|"transactional"|"informational",',
        '                "priority": "high"|"medium"|"low", "reason": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ].join("\n"),
    }),
    refine: (data) => {
      const { kept, dropped } = sanitizeSearchQueries(data.queries, { brandTerms });
      if (kept.length < MIN_SEARCH_QUERIES) {
        return {
          ok: false,
          reason: `Only ${kept.length} usable searches after validation (${dropped
            .slice(0, 4)
            .map((row) => `"${row.query}": ${row.reason}`)
            .join("; ")}).`,
        };
      }
      return { ok: true, data: { ...data, queries: kept } };
    },
  };
}
