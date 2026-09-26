/**
 * Site opportunity wording (Phase 3.3).
 *
 * Code has already found, evidenced and ranked every opportunity
 * (`deriveSiteOpportunities`). This spec asks the model for the words only:
 * a headline, why it matters for this site, what to do, and the first step.
 * It sends a compact site summary plus the top candidates' facts, never page
 * bodies, which keeps the call to a few thousand tokens (architecture §6).
 */

import type { SiteIntelligence, SiteOpportunityCandidate } from "@seo-maker/core/site";
import type { KnowledgeQuery } from "../knowledge";
import { type SiteOpportunity, siteOpportunitySchema } from "../schemas";
import { ungroundedNumbers } from "./grounding";
import type { BusinessBlock, PageFeatureSpec } from "./page";

/** Candidates sent per call. The rest keep their deterministic wording. */
export const SITE_PROMPT_OPPORTUNITIES = 8;

export const SITE_SYSTEM_PROMPT = [
  "You are the analysis layer of an SEO auditing tool. Code has already found and ranked this site's",
  "opportunities from its crawl. You explain them: why each matters for this site, and what to do.",
  "",
  "Rules you must follow without exception:",
  "1. Use only the EVIDENCE and KNOWLEDGE given to you. Never invent a page, URL, product, statistic or claim.",
  "2. Write exactly one entry per opportunity `id` you were given, copying the id exactly. Never add an opportunity.",
  "3. Do not change or restate priority scores, effort or order. They are computed, not yours to decide.",
  "4. Every number you write must appear in that opportunity's facts or headline. Do not compute percentages.",
  "5. The BINDING POLICIES section overrides everything. Do not justify a title or description by a character",
  "   count, and do not recommend a word count: no search engine publishes either.",
  "6. Do not promise rankings, traffic or rich results.",
  "7. When there is no business context (Quick mode), do not guess the business, its audience or its market.",
  "8. In `groundedIn`, list the opportunity ids and knowledge item ids you actually used.",
  "",
  "Respond with a single JSON object and no other text.",
].join("\n");

/** Site facts every site-level prompt shares. Counts and labels, no page text. */
export function siteSummary(intel: SiteIntelligence) {
  const performance = intel.performance?.mobile ?? intel.performance?.desktop ?? null;
  return {
    url: intel.rootUrl,
    pagesAnalyzed: intel.coverage.analyzed,
    pagesFailed: intel.coverage.failed,
    knownUrls: intel.coverage.discovered,
    crawlCoverage: intel.coverage.ratio,
    pageTypes: intel.pageTypes,
    averageInternalLinksIn: intel.links.averageInlinks,
    orphanPages: intel.links.orphans.length,
    schemaTypes: Object.entries(intel.schema.byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([type, pages]) => `${type} (${pages})`),
    pagesWithoutStructuredData: intel.schema.pagesWithout.length,
    sections: intel.topics.slice(0, 6).map((topic) => ({
      section: `/${topic.section}`,
      pages: topic.pages.length,
      topics: topic.terms.slice(0, 5),
    })),
    performance: performance
      ? {
          pagesMeasured: intel.performance?.pagesMeasured ?? 0,
          medianScore: performance.medianScore,
          poorLcpPages: performance.lcp.poor,
          poorClsPages: performance.cls.poor,
        }
      : null,
  };
}

function candidateEvidence(candidate: SiteOpportunityCandidate) {
  return {
    id: candidate.key,
    category: candidate.category,
    headline: candidate.title,
    priority: candidate.priority.band,
    effort: candidate.effort,
    confidence: Math.round(candidate.confidence * 100) / 100,
    pagesAffected: candidate.affectedCount,
    facts: candidate.facts,
    examplePages: candidate.affected.slice(0, 5).map((page) => page.path),
  };
}

export function siteOpportunitySpec(
  intel: SiteIntelligence,
  candidates: SiteOpportunityCandidate[],
  business: BusinessBlock,
): PageFeatureSpec<SiteOpportunity> {
  const offered = candidates.slice(0, SITE_PROMPT_OPPORTUNITIES);
  const evidence = {
    site: siteSummary(intel),
    opportunities: offered.map(candidateEvidence),
  };
  const knowledge: KnowledgeQuery = {
    checks: [...new Set(offered.flatMap((candidate) => candidate.checks))],
    applicability: ["prioritisation", "reporting_language", "myth_guard"],
    domain: "seo",
    limit: 10,
  };

  return {
    feature: "site-opportunity",
    schema: siteOpportunitySchema,
    knowledge,
    evidence,
    maxTokens: 3500,
    temperature: 0.2,
    buildPrompt: (knowledgeBlock) => ({
      system: SITE_SYSTEM_PROMPT,
      user: [
        "# EVIDENCE (from the crawl — the only facts you may use about this site)",
        JSON.stringify(evidence, null, 2),
        "",
        "# SITE AND BUSINESS CONTEXT",
        business
          ? JSON.stringify(business, null, 2)
          : "Not provided (Quick mode). Do not guess the business, its audience or its market.",
        "",
        knowledgeBlock || "# KNOWLEDGE\nNone was retrieved. Say so rather than relying on memory.",
        "",
        "# TASK",
        "For each opportunity, in the order given, write:",
        "- title: a short imperative headline naming the pages or area, e.g. \"Write meta descriptions for 12 service pages\".",
        "- rationale: why this matters for this site, citing its facts. Two or three sentences.",
        "- evidence: one sentence restating its key facts. Numbers must match the facts exactly.",
        "- action: what to do, concretely, referring to the example pages where useful.",
        "- nextStep: the single first step someone could take today.",
        "Then `summary`: the two or three themes that matter most across these opportunities.",
        "Return JSON: {",
        '  "summary": string,',
        '  "opportunities": [{ "id": string, "title": string, "rationale": string, "evidence": string,',
        '                      "action": string, "nextStep": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ].join("\n"),
    }),
    refine: (data) => {
      const byId = new Map(offered.map((candidate) => [candidate.key, candidate]));
      const seen = new Set<string>();
      const opportunities: SiteOpportunity["opportunities"] = [];
      for (const row of data.opportunities) {
        const candidate = byId.get(row.id);
        if (!candidate || seen.has(row.id)) continue;
        seen.add(row.id);
        // A number the facts do not contain is invented. The wording falls
        // back to the deterministic text for that field rather than show it.
        const facts = [candidate.title, ...candidate.facts, String(candidate.affectedCount)].join(" ");
        opportunities.push({
          ...row,
          title: ungroundedNumbers(row.title, facts).length ? candidate.title : row.title,
          evidence: ungroundedNumbers(row.evidence, facts).length ? candidate.facts.slice(0, 2).join(" ") : row.evidence,
          rationale: ungroundedNumbers(row.rationale, facts).length ? candidate.rationale : row.rationale,
        });
      }
      if (opportunities.length === 0) {
        return { ok: false, reason: `No returned id matched the ${offered.length} opportunities offered.` };
      }
      return { ok: true, data: { ...data, opportunities } };
    },
  };
}
