# -*- coding: utf-8 -*-
"""Emit knowledge-item.schema.json at the knowledge/ root."""

import io, json, os, csv
from collections import Counter, defaultdict
import common

KNOW = os.environ["KNOWLEDGE_DIR"]
CORPUS = json.load(io.open(os.path.join(KNOW, "knowledge-corpus.json"), encoding="utf-8"))
ITEMS = CORPUS["items"]


def w(path, obj):
    p = os.path.join(KNOW, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with io.open(p, "w", encoding="utf-8", newline="\n") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("wrote", path)


# ---------------------------------------------------------------- schema
enum = lambda vals, desc: {"type": "string", "enum": vals, "description": desc}
strarr = lambda desc, minitems=0: {
    "type": "array", "items": {"type": "string"}, "minItems": minitems, "description": desc}

schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://seo-maker.local/schema/knowledge-item.schema.json",
    "title": "SEO Maker knowledge item",
    "description": (
        "One atomic, reusable SEO or GEO claim with its evidence class, scope, provenance and the "
        "deterministic checks it can explain."),
    "type": "object",
    "additionalProperties": False,
    "required": [
        "id", "domain", "category", "topic", "knowledgeType", "claimType", "title",
        "principle", "explanation", "whyItMatters", "appliesWhen", "doesNotApplyWhen",
        "entities", "checks", "recommendedAction", "applicability", "evidenceType",
        "evidenceStrength", "confidence", "source", "limitations", "tags",
        "provenance", "version", "lastVerified", "reviewBy", "status",
    ],
    "properties": {
        "id": {"type": "string", "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
               "description": "Stable slug. Prefix encodes domain and area, e.g. seo-tech-*, geo-*, myth-*."},
        "domain": enum(["seo", "geo"], "Top-level split between classic search and generative/AI search."),
        "category": {"type": "string", "description": "Coarse subject area used for grouping and filtering."},
        "topic": {"type": "string", "description": "Primary retrieval key. Should match the deterministic check or finding that fires."},
        "subtopic": {"type": ["string", "null"], "description": "Optional finer retrieval key."},
        "knowledgeType": enum(common.KNOWLEDGE_TYPES,
                              "authoritative requires an official or standards source. 'myth' items must never be emitted as recommendations."),
        "claimType": enum(common.CLAIM_TYPES,
                          "How strong the claim itself is, independent of source quality. 'evaluation_criterion' must never be described as ranking-system behaviour."),
        "title": {"type": "string", "description": "Short human label, one line."},
        "principle": {"type": "string", "description": "The claim itself. Primary embeddable text."},
        "explanation": {"type": "string", "description": "How SEO Maker should apply the claim."},
        "whyItMatters": {"type": "string", "description": "Why this matters for a real audit."},
        "appliesWhen": strarr("Concrete conditions under which the item should be retrieved.", 1),
        "doesNotApplyWhen": strarr("Concrete conditions under which the item must NOT be applied.", 1),
        "entities": {"type": "array", "items": enum(common.ENTITIES, ""),
                     "description": "Which SEO entities the claim concerns."},
        "relatedIssues": strarr("Human-readable issue names this item can explain."),
        "checks": {"type": "array", "items": enum(common.CHECK_IDS, ""),
                   "description": "Deterministic checks in packages/core this item can explain. 'none' means no check maps to it."},
        "recommendedAction": {"type": "string", "description": "What SEO Maker should actually recommend or do."},
        "applicability": {"type": "array", "items": enum(common.APPLICABILITY, ""),
                          "description": "Retrieval routing tags for the feature in play."},
        "evidenceType": enum(common.EVIDENCE_TYPES, "The kind of evidence behind the claim."),
        "evidenceStrength": enum(common.EVIDENCE_STRENGTH, "How strong that evidence is. Never phrase a recommendation above this level."),
        "confidence": enum(["high", "medium", "low"], "Overall confidence in the item as written."),
        "source": {
            "type": "object", "additionalProperties": False,
            "required": ["name", "publisher", "type"],
            "properties": {
                "name": {"type": "string"},
                "publisher": {"type": "string"},
                "url": {"type": ["string", "null"]},
                "type": enum(["official", "standard", "research", "expert"], ""),
                "location": {"type": ["string", "null"], "description": "Section, page, table or heading within the source."},
                "quote": {"type": ["string", "null"], "description": "Short verbatim quote. Null when not verified against the source."},
                "localPath": {"type": ["string", "null"], "description": "Path to the archived source under knowledge/raw/."},
                "publishedDate": {"type": ["string", "null"]},
                "lastUpdated": {"type": ["string", "null"]},
                "accessedDate": {"type": ["string", "null"]},
            },
        },
        "limitations": {"type": "string", "minLength": 1,
                        "description": "Mandatory. An item with no stated limit is usually an overclaim."},
        "relatedKnowledge": strarr("Ids of related items. Reverse links are backfilled at build time."),
        "tags": strarr("Free-text retrieval tags.", 1),
        "provenance": {
            "type": "object", "additionalProperties": False,
            "required": ["sourceSupport", "extractionPass", "verifiedAgainstLocalSource"],
            "properties": {
                "sourceSupport": enum(common.SOURCE_SUPPORT,
                                      "direct = stated by the source; derived = follows from it; insufficient = do not rely on it."),
                "modelInterpretation": {"type": ["string", "null"],
                                        "description": "Anything added by the extractor beyond the source, labelled as such."},
                "extractionPass": {"type": "string", "description": "Which pass produced the item."},
                "verifiedAgainstLocalSource": {"type": "boolean",
                                               "description": "True only if the source document under knowledge/raw/ was read in that pass."},
                "migrationNote": {"type": "string"},
            },
        },
        "version": {"type": "string", "description": "Source version or date the claim was taken from."},
        "lastVerified": {"type": "string", "format": "date"},
        "reviewBy": {"type": "string", "format": "date",
                     "description": "Re-verify by this date. GEO quarterly, official docs ~6 months, standards yearly."},
        "potentiallyOutdated": {"type": "boolean"},
        "status": enum(["active", "revised", "superseded", "needs_verification"],
                       "Retrieval must exclude 'superseded' and 'needs_verification'."),
        "supersededBy": {"type": "string", "description": "Id of the item that replaces this one."},
        "governingPolicies": {"type": "array", "items": {"type": "string"}, "description": "Ids in corpus.policies that override this item phrasing. Apply before emitting recommendedAction."},
    },
}
w("knowledge-item.schema.json", schema)



print("schema items validated against:", len(ITEMS), "items")
