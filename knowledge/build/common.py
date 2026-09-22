# -*- coding: utf-8 -*-
"""Shared helpers + controlled vocabularies for the SEO Maker knowledge corpus."""

TODAY = "2026-09-22"

KNOWLEDGE_TYPES = ["authoritative", "heuristic", "research", "myth"]

# How strong the CLAIM is, independent of how good the source is.
CLAIM_TYPES = [
    "official_requirement",     # a standard or engine says MUST
    "official_recommendation",  # a first-party source says SHOULD / recommends
    "documented_behavior",      # first-party description of what the system does
    "specification_rule",       # normative rule in a ratified standard
    "evaluation_criterion",     # a rubric humans apply, not an algorithm
    "experimental_result",      # measured under a stated method
    "correlation",              # association only
    "case_study",
    "expert_opinion",
    "common_practice",
    "myth",                     # a claim the sources do not support
]

EVIDENCE_TYPES = [
    "official_documentation", "standard", "research", "experiment",
    "case_study", "expert_recommendation", "industry_observation",
]

EVIDENCE_STRENGTH = ["strong", "moderate", "weak", "unknown"]

ENTITIES = [
    "page", "site", "content", "link", "image", "video",
    "structured_data", "technical_configuration", "business", "query", "crawler",
]

# Retrieval routing tags. Superset of the v1 vocabulary.
APPLICABILITY = [
    "page_audit", "site_audit", "technical_audit", "canonical_analysis",
    "title_generation", "meta_generation", "heading_analysis", "content_analysis",
    "image_analysis", "internal_link_analysis", "performance_analysis",
    "structured_data_analysis", "international_analysis", "geo_analysis",
    "myth_guard", "crawl_analysis", "indexability_analysis", "url_analysis",
    "intent_analysis", "freshness_analysis", "local_analysis", "ecommerce_analysis",
    "spam_risk_analysis", "prioritisation", "reporting_language",
]

# Deterministic checks in packages/core/src/scoring/page-audit.ts (CheckId)
# plus the site-level audits in core/src/{robots,sitemap}/audit.ts.
CHECK_IDS = [
    "status", "title", "meta", "h1", "h2", "canonical", "images", "links",
    "words", "schema", "indexability", "robots", "sitemap",
    # site-level audit surfaces, not CheckId members
    "robots_audit", "sitemap_audit", "crawl_plan", "none",
]

SOURCE_SUPPORT = ["direct", "derived", "insufficient"]


def item(**kw):
    """Build one knowledge item, applying defaults and validating vocabularies."""
    src = kw["source"]
    out = {
        "id": kw["id"],
        "domain": kw["domain"],
        "category": kw["category"],
        "topic": kw["topic"],
        "subtopic": kw.get("subtopic"),
        "knowledgeType": kw["knowledgeType"],
        "claimType": kw["claimType"],
        "title": kw["title"],
        "principle": kw["principle"],
        "explanation": kw["explanation"],
        "whyItMatters": kw["whyItMatters"],
        "appliesWhen": kw["appliesWhen"],
        "doesNotApplyWhen": kw["doesNotApplyWhen"],
        "entities": kw["entities"],
        "relatedIssues": kw.get("relatedIssues", []),
        "checks": kw.get("checks", ["none"]),
        "recommendedAction": kw["recommendedAction"],
        "applicability": kw["applicability"],
        "evidenceType": kw["evidenceType"],
        "evidenceStrength": kw["evidenceStrength"],
        "confidence": kw["confidence"],
        "source": {
            "name": src["name"],
            "publisher": src["publisher"],
            "url": src.get("url"),
            "type": src["type"],
            "location": kw.get("location"),
            "quote": kw.get("quote"),
            "localPath": src.get("localPath"),
            "publishedDate": src.get("publishedDate"),
            "lastUpdated": src.get("lastUpdated"),
            "accessedDate": src.get("accessedDate"),
        },
        "limitations": kw["limitations"],
        "relatedKnowledge": kw.get("relatedKnowledge", []),
        "tags": kw["tags"],
        "provenance": {
            "sourceSupport": kw.get("sourceSupport", "direct"),
            "modelInterpretation": kw.get("modelInterpretation"),
            "extractionPass": kw.get("extractionPass", "raw-2026-09-22"),
            "verifiedAgainstLocalSource": kw.get("verified", True),
        },
        "version": kw["version"],
        "lastVerified": kw.get("lastVerified", TODAY),
        "reviewBy": kw["reviewBy"],
        "potentiallyOutdated": kw.get("potentiallyOutdated", False),
    }
    _validate(out)
    return out


def _validate(o):
    i = o["id"]
    assert o["knowledgeType"] in KNOWLEDGE_TYPES, (i, o["knowledgeType"])
    assert o["claimType"] in CLAIM_TYPES, (i, o["claimType"])
    assert o["evidenceType"] in EVIDENCE_TYPES, (i, o["evidenceType"])
    assert o["evidenceStrength"] in EVIDENCE_STRENGTH, (i, o["evidenceStrength"])
    assert o["confidence"] in ("high", "medium", "low"), (i, o["confidence"])
    assert o["domain"] in ("seo", "geo"), (i, o["domain"])
    assert o["source"]["type"] in ("official", "standard", "research", "expert"), (i,)
    assert o["provenance"]["sourceSupport"] in SOURCE_SUPPORT, (i,)
    for e in o["entities"]:
        assert e in ENTITIES, (i, e)
    for a in o["applicability"]:
        assert a in APPLICABILITY, (i, a)
    for c in o["checks"]:
        assert c in CHECK_IDS, (i, c)
    assert o["limitations"], f"{i}: limitations is mandatory"
    assert o["appliesWhen"] and o["doesNotApplyWhen"], f"{i}: scope is mandatory"
    # An authoritative item must rest on an official or standards source.
    if o["knowledgeType"] == "authoritative":
        assert o["source"]["type"] in ("official", "standard"), (i, "authoritative needs official/standard source")


# ---- source descriptors, reused across items ----------------------------

RFC9309 = dict(
    name="RFC 9309 - Robots Exclusion Protocol",
    publisher="IETF (authors: Koster, Illyes, Zeller, Sassman)",
    url="https://www.rfc-editor.org/rfc/rfc9309.html",
    type="standard",
    localPath="knowledge/raw/seo/Robots Exclusion Protocol.pdf",
    publishedDate="2022-09",
    accessedDate=TODAY,
)

STARTER = dict(
    name="SEO Starter Guide: The Basics",
    publisher="Google Search Central",
    url="https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
    type="official",
    localPath="knowledge/raw/seo/SEO Starter Guide - The Basics (Google Search Central).pdf",
    lastUpdated="2025-12-10",
    accessedDate=TODAY,
)

HELPFUL = dict(
    name="Creating helpful, reliable, people-first content",
    publisher="Google Search Central",
    url="https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
    type="official",
    localPath="knowledge/raw/seo/Creating Helpful, Reliable, People-First Content (Google Search Central).pdf",
    lastUpdated="2025-12-10",
    accessedDate=TODAY,
)

AIOPT = dict(
    name="Optimizing your website for generative AI features on Google Search",
    publisher="Google Search Central",
    url="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
    type="official",
    localPath="knowledge/raw/geo/Optimizing for Generative AI Features on Google Search (Google Search Central).pdf",
    lastUpdated="2026-07-10",
    accessedDate=TODAY,
)

QRG = dict(
    name="General Guidelines (Search Quality Rater Guidelines)",
    publisher="Google",
    url="https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf",
    type="official",
    localPath="knowledge/raw/seo/searchqualityevaluatorguidelines.pdf",
    publishedDate="2025-09-11",
    accessedDate=TODAY,
)

QRG_OVERVIEW = dict(
    name="Search Quality Rater Guidelines: An Overview",
    publisher="Google",
    url="https://services.google.com/fh/files/misc/hsw-sqrg.pdf",
    type="official",
    localPath="knowledge/raw/seo/search quality rater guidelines an overview.pdf",
    publishedDate="2023-11",
    accessedDate=TODAY,
)

BRODER = dict(
    name="A taxonomy of web search",
    publisher="Andrei Broder, IBM Research - ACM SIGIR Forum 36(2)",
    url="https://sigir.org/files/forum/F2002/broder.pdf",
    type="research",
    localPath="knowledge/raw/seo/taxonomy of web search.pdf",
    publishedDate="2002",
    accessedDate=TODAY,
)

GEOPAPER = dict(
    name="GEO: Generative Engine Optimization",
    publisher="Aggarwal, Murahari, Rajpurohit, Kalyan, Narasimhan, Deshpande - KDD '24",
    url="https://arxiv.org/pdf/2311.09735",
    type="research",
    localPath="knowledge/raw/geo/GEO - Generative Engine Optimization (Aggarwal et al, KDD 2024).pdf",
    publishedDate="2024-06-28",
    accessedDate=TODAY,
)
