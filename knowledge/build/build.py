# -*- coding: utf-8 -*-
"""Assemble the SEO Maker knowledge corpus.

Emits exactly two files, both at the knowledge/ root:
  knowledge-corpus.json        the single ingest artifact
  knowledge-item.schema.json   the validation contract

No CSV, no JSONL, no derived side files. The source register and the controlled
vocabularies live inside the corpus so there is one file to load and nothing to
keep in sync.
"""

import io, json, os, sys
from collections import Counter, defaultdict

import common
import src_rfc9309, src_starter, src_helpful, src_aiopt, src_qrg, src_research
import migrate_seed
import policies as policies_mod

KNOW = os.environ["KNOWLEDGE_DIR"]
SEED = os.path.join(KNOW, "archive", "v1-2026-09-22", "knowledge-items.json")

NEW_MODULES = [src_rfc9309, src_starter, src_helpful, src_aiopt, src_qrg, src_research]

VOCAB_MEANINGS = {
    "knowledgeType": {
        "authoritative": "Official search-engine documentation, standards or specifications. Requires source.type official or standard.",
        "heuristic": "Practitioner convention or reasonable best practice. Never present as an engine requirement.",
        "research": "Peer-reviewed or preprint studies, experiments, benchmarks. Preserve method and population.",
        "myth": "A claim the sources do not support. Exists so the model contradicts it. Never emit as a recommendation.",
    },
    "claimType": {
        "official_requirement": "A standard or engine states a MUST.",
        "official_recommendation": "A first-party source recommends it.",
        "documented_behavior": "First-party description of how the system behaves.",
        "specification_rule": "Normative rule in a ratified standard.",
        "evaluation_criterion": "A rubric humans apply. NEVER describe as ranking-system behaviour.",
        "experimental_result": "Measured under a stated method. Never restate as causation.",
        "correlation": "Association only. Never restate as causation.",
        "case_study": "Single-case evidence.",
        "expert_opinion": "Named expert judgement.",
        "common_practice": "Widely done; evidence not established.",
        "myth": "Unsupported claim recorded for contradiction.",
    },
    "evidenceStrength": {
        "strong": "First-party documentation or ratified standard, directly quoted.",
        "moderate": "Peer-reviewed research, or official documentation applied by inference.",
        "weak": "Single study, practitioner observation, or convention.",
        "unknown": "Not established.",
    },
    "status": {
        "active": "Use freely.",
        "revised": "Corrected in this pass; use freely. See provenance.migrationNote.",
        "superseded": "Replaced by supersededBy. EXCLUDE from retrieval.",
        "needs_verification": "Source not confirmed. EXCLUDE from retrieval and from user-facing output.",
    },
    "sourceSupport": {
        "direct": "Stated by the source.",
        "derived": "Follows from the source but is not stated in those words.",
        "insufficient": "Do not rely on this item.",
    },
    "checks": {
        "_note": "CheckId values from packages/core/src/scoring/page-audit.ts, plus site-level audit surfaces.",
        "pageAudit": ["status", "title", "meta", "h1", "h2", "canonical", "images",
                      "links", "words", "schema", "indexability", "robots", "sitemap"],
        "siteLevel": ["robots_audit", "sitemap_audit", "crawl_plan"],
        "none": "No deterministic check maps to this item; it is interpretation-only knowledge.",
    },
}


def main():
    seed = migrate_seed.migrate(json.load(io.open(SEED, encoding="utf-8"))["items"])
    new = []
    for m in NEW_MODULES:
        for it in m.ITEMS:
            it = dict(it)
            it.setdefault("status", "active")
            new.append(it)
    items = seed + new

    # ---- integrity checks -------------------------------------------------
    errors = []
    ids = [i["id"] for i in items]
    for k, v in Counter(ids).items():
        if v > 1:
            errors.append(f"duplicate id: {k}")
    idset = set(ids)
    for i in items:
        for r in i.get("relatedKnowledge", []):
            if r not in idset:
                errors.append(f"{i['id']}: relatedKnowledge -> missing {r}")
        sb = i.get("supersededBy")
        if sb and sb not in idset:
            errors.append(f"{i['id']}: supersededBy -> missing {sb}")
        if i["knowledgeType"] == "authoritative" and i["source"]["type"] not in ("official", "standard"):
            errors.append(f"{i['id']}: authoritative item on a non-official source")
        if not i["limitations"]:
            errors.append(f"{i['id']}: empty limitations")
        if i["provenance"]["verifiedAgainstLocalSource"] and not i["source"]["location"]:
            errors.append(f"{i['id']}: verified but no source.location")
        if not i["provenance"]["verifiedAgainstLocalSource"] and (i["source"]["quote"] or i["source"]["location"]):
            errors.append(f"{i['id']}: unverified item carries a quote or location")

    for p in policies_mod.POLICIES:
        for iid in p["appliesToItems"]:
            if iid not in idset:
                errors.append(f"{p['id']}: appliesToItems -> missing {iid}")

    if errors:
        print("INTEGRITY ERRORS:")
        for e in errors:
            print("  -", e)
        sys.exit(1)

    # ---- backfill reverse links ------------------------------------------
    rev = defaultdict(set)
    for i in items:
        for r in i.get("relatedKnowledge", []):
            rev[r].add(i["id"])
    for i in items:
        merged = set(i.get("relatedKnowledge", [])) | rev.get(i["id"], set())
        i["relatedKnowledge"] = sorted(x for x in merged if x != i["id"])

    # ---- attach governing policies to items ------------------------------
    pol_by_item = defaultdict(list)
    for p in policies_mod.POLICIES:
        for iid in p["appliesToItems"]:
            pol_by_item[iid].append(p["id"])
        for c in p["appliesToChecks"]:
            if c == "none":
                continue
            for i in items:
                if c in i["checks"]:
                    pol_by_item[i["id"]].append(p["id"])
    for i in items:
        gp = sorted(set(pol_by_item.get(i["id"], [])))
        if gp:
            i["governingPolicies"] = gp

    # ---- source register, folded in --------------------------------------
    by_src = defaultdict(list)
    for i in items:
        s = i["source"]
        key = s["url"].strip().lower() if s.get("url") else "name:" + s["name"].strip().lower()
        by_src[key].append(i)

    sources = []
    for key, its in sorted(by_src.items(), key=lambda kv: -len(kv[1])):
        names = Counter(i["source"]["name"] for i in its)
        name = names.most_common(1)[0][0]
        s0 = next((i["source"] for i in its if i["source"].get("localPath")), its[0]["source"])
        verified = any(i["provenance"]["verifiedAgainstLocalSource"] for i in its)
        sources.append({
            "name": name,
            "aliases": sorted(n for n in names if n != name),
            "publisher": s0["publisher"],
            "url": its[0]["source"].get("url"),
            "type": s0["type"],
            "authorityClass": "AUTHORITATIVE" if s0["type"] in ("official", "standard")
                              else ("RESEARCH" if s0["type"] == "research" else "HEURISTIC"),
            "localPath": s0.get("localPath"),
            "readInFull": verified,
            "publishedDate": s0.get("publishedDate"),
            "lastUpdated": s0.get("lastUpdated"),
            "itemCount": len(its),
            "itemIds": sorted(i["id"] for i in its),
        })

    active = [i for i in items if i["status"] in ("active", "revised")]

    corpus = {
        "schemaVersion": "2.1",
        "generated": common.TODAY,
        "description": (
            "Atomic, provenance-tracked SEO and GEO knowledge for SEO Maker's AI grounding layer. Self-contained: "
            "items, controlled vocabularies, resolved policies and the source register are all in this file. "
            "Validate items against knowledge-item.schema.json."
        ),
        "usage": {
            "loadThis": "The whole file. There is no companion CSV or JSONL.",
            "beforeAnswering": (
                "Filter items by checks/topic/applicability, drop status 'superseded' and 'needs_verification', "
                "then apply every policy in `policies` whose appliesToChecks or appliesToItems matches. A policy "
                "overrides an item's own phrasing."
            ),
            "neverDo": (
                "Never emit a knowledgeType 'myth' item as a recommendation - it exists so the model contradicts "
                "the claim. Never phrase a recommendation more strongly than the item's evidenceStrength."
            ),
        },
        "counts": {
            "total": len(items),
            "active": len(active),
            "byStatus": dict(Counter(i["status"] for i in items)),
            "byKnowledgeType": dict(Counter(i["knowledgeType"] for i in items)),
            "byDomain": dict(Counter(i["domain"] for i in items)),
            "byEvidenceStrength": dict(Counter(i["evidenceStrength"] for i in items)),
            "verifiedAgainstLocalSource": sum(1 for i in items if i["provenance"]["verifiedAgainstLocalSource"]),
            "sources": len(sources),
            "sourcesReadInFull": sum(1 for s in sources if s["readInFull"]),
            "policies": len(policies_mod.POLICIES),
        },
        "vocabularies": {
            "knowledgeType": VOCAB_MEANINGS["knowledgeType"],
            "claimType": VOCAB_MEANINGS["claimType"],
            "evidenceType": common.EVIDENCE_TYPES,
            "evidenceStrength": VOCAB_MEANINGS["evidenceStrength"],
            "entities": common.ENTITIES,
            "applicability": common.APPLICABILITY,
            "checks": VOCAB_MEANINGS["checks"],
            "sourceSupport": VOCAB_MEANINGS["sourceSupport"],
            "status": VOCAB_MEANINGS["status"],
        },
        "retrieval": {
            "structuredFilters": [
                "domain", "category", "topic", "subtopic", "knowledgeType", "claimType",
                "applicability", "checks", "entities", "source.type", "evidenceStrength",
                "confidence", "status", "lastVerified",
            ],
            "embeddableText": [
                "title", "principle", "explanation", "whyItMatters", "recommendedAction", "limitations",
            ],
            "routing": (
                "A deterministic finding maps to `checks` and `topic`. Filter by `applicability` for the feature "
                "in play, drop status 'superseded' and 'needs_verification', then order authoritative > research "
                "> heuristic. Route myth items to a contradiction slot, never a recommendation slot."
            ),
            "guardrails": [
                "Do not present a claimType 'evaluation_criterion' item as ranking-system behaviour.",
                "Do not present 'experimental_result' or 'correlation' as causation.",
                "Do not raise an item above its evidenceStrength when phrasing a recommendation.",
                "Always carry `limitations` into any answer that uses the item.",
                "Prefer provenance.verifiedAgainstLocalSource=true when two items cover the same ground.",
                "Apply `governingPolicies` before emitting an item's recommendedAction.",
            ],
        },
        "policies": policies_mod.POLICIES,
        "sources": sources,
        "items": items,
    }

    out = os.path.join(KNOW, "knowledge-corpus.json")
    with io.open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(corpus, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("wrote knowledge-corpus.json")
    print(json.dumps(corpus["counts"], indent=2))
    return corpus


if __name__ == "__main__":
    main()
