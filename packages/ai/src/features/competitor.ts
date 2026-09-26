/**
 * Competitor interpretation (Phase 4.1, 4.2).
 *
 * The comparison (`compareWithCompetitor`) holds what was observed, as facts
 * with ids. This spec asks the model what those facts may mean, and every
 * interpretation must name the fact it interprets. The product then shows
 * facts as facts and interpretation as interpretation, side by side.
 *
 * Without business context the model may not say a gap is worth pursuing:
 * a competitor having a page is not evidence your site needs one.
 */

import type { CompetitorComparison, CompetitorFact } from "@seo-maker/core/competitors";
import type { SiteIntelligence } from "@seo-maker/core/site";
import type { KnowledgeQuery } from "../knowledge";
import { type CompetitorInsight, competitorInsightSchema } from "../schemas";
import type { BusinessBlock, PageFeatureSpec } from "./page";

const MAX_FACTS = 30;

/** Fact kinds that describe how a site is built rather than what it covers. */
const STRUCTURAL: ReadonlySet<CompetitorFact["kind"]> = new Set(["page-type", "structured-data", "internal-links", "depth"]);

export const COMPETITOR_SYSTEM_PROMPT = [
  "You are the competitive analysis layer of an SEO auditing tool. Code compared the user's site with one",
  "competitor and recorded FACTS, each with an id. You write the INTERPRETATION: what the facts may mean.",
  "",
  "Rules you must follow without exception:",
  "1. Interpret only the facts given. Put the fact's id in `factId`. Never state a fact that is not in the list.",
  "2. Keep interpretation separate from fact: say what a fact may mean, not what was observed again.",
  "3. `strengths` interpret facts that favour the competitor; `weaknesses` interpret facts that favour the user.",
  "4. A competitor having a page does not prove the user's site needs one. worthPursuing is \"yes\" only when the",
  "   business context shows the topic fits the business, \"maybe\" when it might, \"no\" when it does not.",
  "   Without business context (Quick mode), never answer \"yes\".",
  "5. Never claim the competitor ranks for anything unless a keyword fact says so. Never state traffic, keyword",
  "   volumes or indexing status: none are in the facts. Do not promise rankings or traffic.",
  "6. The BINDING POLICIES section overrides everything; never state a myth as advice.",
  "7. In `groundedIn`, list the fact ids and knowledge item ids you actually used.",
  "",
  "Respond with a single JSON object and no other text.",
].join("\n");

const GAP_KIND: Record<CompetitorFact["kind"], CompetitorInsight["gaps"][number]["kind"] | null> = {
  topic: "topic",
  keyword: "keyword",
  "page-type": "page-type",
  depth: "depth",
  "structured-data": "structured-data",
  "internal-links": null,
};

export function competitorInsightSpec(
  comparison: CompetitorComparison,
  site: SiteIntelligence,
  business: BusinessBlock,
): PageFeatureSpec<CompetitorInsight> {
  const facts = comparison.facts.slice(0, MAX_FACTS);
  const evidence = {
    competitor: comparison.domain,
    pagesCompared: comparison.pagesCompared,
    yourSite: { url: site.rootUrl, pagesAnalyzed: site.coverage.analyzed, pageTypes: site.pageTypes },
    facts: facts.map((fact) => ({ id: fact.id, kind: fact.kind, favours: fact.favours, statement: fact.statement })),
    limits: comparison.limits,
  };
  const knowledge: KnowledgeQuery = {
    applicability: ["content_analysis", "intent_analysis", "structured_data_analysis", "reporting_language", "myth_guard"],
    domain: "seo",
    limit: 8,
  };

  return {
    feature: "competitor-insight",
    schema: competitorInsightSchema,
    knowledge,
    evidence,
    maxTokens: 3500,
    temperature: 0.2,
    buildPrompt: (knowledgeBlock) => ({
      system: COMPETITOR_SYSTEM_PROMPT,
      user: [
        "# FACTS (observed by code in both crawls — the only facts you may use)",
        JSON.stringify(evidence, null, 2),
        "",
        "# SITE AND BUSINESS CONTEXT",
        business
          ? JSON.stringify(business, null, 2)
          : "Not provided (Quick mode). Do not guess the business, and never set worthPursuing to \"yes\".",
        "",
        knowledgeBlock || "# KNOWLEDGE\nNone was retrieved. Say so rather than relying on memory.",
        "",
        "# TASK",
        "- summary: what the comparison shows overall, in two to four sentences, hedged where the limits apply.",
        "- strengths: the competitor's advantages, one per fact that favours them, most important first.",
        "- weaknesses: where the user's site is ahead, one per fact that favours the user.",
        "- gaps: for facts of kind topic, keyword, page-type, depth or structured-data that favour the competitor,",
        "  say what the gap may mean, what the user could do, and whether it is worth pursuing, with the reason.",
        "- structuralDifferences: how the two sites are built differently, one per fact of kind page-type,",
        "  structured-data, internal-links or depth, whichever side it favours.",
        "- opportunities: at most five concrete things the user could do, each citing the fact ids it rests on,",
        "  with whether it is worth pursuing and why. Without business context never answer \"yes\".",
        "Return JSON: {",
        '  "summary": string,',
        '  "strengths": [{ "factId": string, "interpretation": string }],',
        '  "weaknesses": [{ "factId": string, "interpretation": string }],',
        '  "gaps": [{ "factId": string, "kind": "topic"|"keyword"|"page-type"|"depth"|"structured-data",',
        '             "interpretation": string, "recommendation": string, "worthPursuing": "yes"|"maybe"|"no", "reason": string }],',
        '  "structuralDifferences": [{ "factId": string, "interpretation": string }],',
        '  "opportunities": [{ "factIds": string[], "title": string, "action": string, "worthPursuing": "yes"|"maybe"|"no", "reason": string }],',
        '  "groundedIn": string[], "confidence": "high"|"medium"|"low", "needsHumanReview": boolean',
        "}",
      ].join("\n"),
    }),
    refine: (data) => {
      const byId = new Map(facts.map((fact) => [fact.id, fact]));
      const favouring = (side: CompetitorFact["favours"]) => (row: { factId: string }) => byId.get(row.factId)?.favours === side;
      const gaps = data.gaps.flatMap((gap) => {
        const fact = byId.get(gap.factId);
        const kind = fact ? GAP_KIND[fact.kind] : null;
        if (!fact || fact.favours !== "competitor" || !kind) return [];
        return [
          {
            ...gap,
            // The fact decides what kind of gap it is, not the model.
            kind,
            // Pursuing a gap is a business judgement; with no business
            // context there is nothing to base "yes" on.
            worthPursuing: !business && gap.worthPursuing === "yes" ? ("maybe" as const) : gap.worthPursuing,
          },
        ];
      });
      const structural = data.structuralDifferences.filter((row) => {
        const fact = byId.get(row.factId);
        return Boolean(fact && STRUCTURAL.has(fact.kind));
      });
      const opportunities = data.opportunities.flatMap((row) => {
        const factIds = [...new Set(row.factIds)].filter((id) => byId.has(id));
        if (factIds.length === 0) return [];
        return [
          {
            ...row,
            factIds,
            worthPursuing: !business && row.worthPursuing === "yes" ? ("maybe" as const) : row.worthPursuing,
          },
        ];
      });
      const refined = {
        ...data,
        strengths: data.strengths.filter(favouring("competitor")),
        weaknesses: data.weaknesses.filter(favouring("self")),
        gaps,
        structuralDifferences: structural,
        opportunities,
      };
      if (
        facts.length > 0 &&
        refined.strengths.length + refined.weaknesses.length + refined.gaps.length + structural.length + opportunities.length === 0
      ) {
        return { ok: false, reason: "No interpretation referred to a fact that was given." };
      }
      return { ok: true, data: refined };
    },
  };
}
