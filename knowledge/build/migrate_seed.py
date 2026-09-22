# -*- coding: utf-8 -*-
"""Migrate the 65 v1 seed items into the v2 schema.

Honesty rules applied here:

1. A seed item whose source document is NOT in knowledge/raw/ was not re-read in
   this pass. It is carried forward faithfully and marked
   provenance.verifiedAgainstLocalSource = false, sourceSupport = "derived",
   with source.quote and source.location left null. We do not invent quotes.

2. Fields the v1 schema did not have are derived MECHANICALLY, not imagined:
     - appliesWhen      <- from the v1 `applicability` routing tags
     - doesNotApplyWhen <- from the v1 `limitations` text, which the v1 README
                           defines as "when the claim does NOT apply"
     - evidenceType/Strength <- from v1 source.type + knowledgeType
   Anything requiring real judgement is supplied only in VERIFIED_OVERRIDES,
   for items whose source we actually read in this pass.

3. Seed items now fully covered by a better-sourced v2 item are marked
   status = "superseded" with supersededBy, rather than deleted.
"""

import io, json, os

SEED_PATH = None  # set by build.py

# Sources we read in full this pass. Seed items citing these can be verified.
VERIFIED_SOURCE_MARKERS = [
    "rfc9309", "rfc-editor.org/rfc/rfc9309",
    "seo-starter-guide",
    "creating-helpful-content",
    "ai-optimization-guide",
    "searchqualityevaluatorguidelines",
    "sigir.org/files/forum/F2002/broder",
    "arxiv.org/pdf/2311.09735",
]

APPLICABILITY_PHRASE = {
    "page_audit": "Auditing an individual page",
    "site_audit": "Auditing a site as a whole",
    "technical_audit": "Running technical SEO checks",
    "canonical_analysis": "Analysing canonical and duplicate-URL signals",
    "title_generation": "Evaluating or generating a page title",
    "meta_generation": "Evaluating or generating a meta description",
    "heading_analysis": "Analysing heading structure",
    "content_analysis": "Assessing page content",
    "image_analysis": "Analysing images and alt text",
    "internal_link_analysis": "Analysing internal links and anchor text",
    "performance_analysis": "Analysing page performance",
    "structured_data_analysis": "Analysing structured data",
    "international_analysis": "Analysing hreflang and international targeting",
    "geo_analysis": "Analysing visibility in AI and generative search",
    "myth_guard": "Correcting an outdated or unsupported SEO claim",
}

# topic -> deterministic checks in packages/core
TOPIC_CHECKS = {
    "robots_txt": ["robots", "robots_audit"],
    "http_status_codes": ["status"],
    "soft_404": ["status", "words"],
    "canonicalization": ["canonical"],
    "redirects": ["status", "canonical"],
    "sitemap": ["sitemap", "sitemap_audit"],
    "title_tag": ["title"],
    "meta_description": ["meta"],
    "snippet_controls": ["indexability", "robots"],
    "image_alt_text": ["images"],
    "headings": ["h1", "h2"],
    "content_quality": ["words"],
    "content_length": ["words"],
    "ai_generated_content": ["none"],
    "eeat": ["none"],
    "ymyl": ["none"],
    "search_intent": ["none"],
    "core_web_vitals": ["none"],
    "measurement": ["none"],
    "inp": ["none"],
    "rich_results": ["schema"],
    "structured_data_quality": ["schema"],
    "structured_data_properties": ["schema"],
    "schema_org": ["schema"],
    "hreflang": ["canonical"],
    "internal_links": ["links"],
    "anchor_text": ["links"],
    "site_architecture": ["links"],
    "keyword_density": ["none"],
    "third_party_metrics": ["none"],
    "structured_data_for_ai": ["schema"],
    "llms_txt": ["none"],
}

TOPIC_ENTITIES = {
    "robots_txt": ["site", "technical_configuration", "crawler"],
    "http_status_codes": ["page", "technical_configuration"],
    "soft_404": ["page", "content"],
    "canonicalization": ["page", "site", "technical_configuration"],
    "redirects": ["page", "technical_configuration"],
    "sitemap": ["site", "technical_configuration"],
    "title_tag": ["page", "content"],
    "meta_description": ["page", "content"],
    "snippet_controls": ["page", "technical_configuration"],
    "image_alt_text": ["image", "page"],
    "headings": ["page", "content"],
    "content_quality": ["page", "content"],
    "content_length": ["page", "content"],
    "ai_generated_content": ["content", "page"],
    "eeat": ["content", "site"],
    "ymyl": ["content", "site", "business"],
    "search_intent": ["query", "content"],
    "core_web_vitals": ["page", "site"],
    "measurement": ["page", "site"],
    "inp": ["page"],
    "rich_results": ["page", "structured_data"],
    "structured_data_quality": ["page", "structured_data"],
    "structured_data_properties": ["page", "structured_data"],
    "schema_org": ["structured_data"],
    "hreflang": ["page", "site", "technical_configuration"],
    "internal_links": ["link", "page", "site"],
    "anchor_text": ["link", "page"],
    "site_architecture": ["site", "link"],
    "keyword_density": ["content"],
    "third_party_metrics": ["site"],
    "structured_data_for_ai": ["structured_data", "page"],
    "llms_txt": ["site", "technical_configuration"],
    "google_ai_features": ["site", "page"],
    "retrieval_mechanics": ["content", "page"],
    "geo_myths": ["site", "content"],
    "chatgpt_search": ["site", "technical_configuration"],
    "attribution": ["site", "business"],
    "copilot_grounding": ["site", "technical_configuration"],
    "citation_optimization": ["content"],
    "content_optimization": ["content"],
    "geo_tactics": ["content"],
    "extractability": ["content", "page"],
    "citation_behavior": ["site", "content"],
}

CLAIM_TYPE_BY_KT = {
    "authoritative": "documented_behavior",
    "heuristic": "common_practice",
    "research": "experimental_result",
    "myth": "myth",
}

EVIDENCE_TYPE_BY_SRC = {
    "official": "official_documentation",
    "standard": "standard",
    "research": "research",
    "expert": "expert_recommendation",
}

EVIDENCE_STRENGTH = {
    ("official", "high"): "strong", ("standard", "high"): "strong",
    ("official", "medium"): "moderate", ("standard", "medium"): "moderate",
    ("official", "low"): "weak", ("standard", "low"): "weak",
    ("research", "high"): "moderate", ("research", "medium"): "moderate",
    ("research", "low"): "weak",
    ("expert", "high"): "moderate", ("expert", "medium"): "weak",
    ("expert", "low"): "weak",
}

PUBLISHER_BY_HOST = {
    "developers.google.com": "Google Search Central",
    "web.dev": "Google / Chrome team",
    "schema.org": "Schema.org (W3C community)",
    "www.rfc-editor.org": "IETF",
    "static.googleusercontent.com": "Google",
    "sigir.org": "ACM SIGIR Forum",
    "arxiv.org": "arXiv / ACM KDD",
    "help.openai.com": "OpenAI",
    "www.bing.com": "Microsoft Bing",
    "learn.microsoft.com": "Microsoft Learn",
    "yoast.com": "Yoast",
    "www.searchenginejournal.com": "Search Engine Journal",
    "audisto.com": "Audisto",
    "www.conductor.com": "Conductor",
    "www.onely.com": "Onely",
    "www.seroundtable.com": "Search Engine Roundtable",
}


# --------------------------------------------------------------------------
# Verified overrides: seed items whose source we READ in this pass.
# These carry real quotes, locations, and corrected text.
# --------------------------------------------------------------------------
VERIFIED_OVERRIDES = {
    "seo-tech-robots-txt-scope": dict(
        status="superseded",
        supersededBy="seo-tech-robots-standardised",
        location="Abstract; Section 2 (Specification)",
        note="Superseded by a fuller extraction from the RFC read in this pass.",
    ),
    "seo-tech-robots-txt-unreachable": dict(
        status="superseded",
        supersededBy="seo-tech-robots-5xx-disallow",
        location="Sections 2.3.1.3 and 2.3.1.4, page 8",
        note=("Superseded. The seed item merged two distinct RFC rules; they are now split into "
              "seo-tech-robots-4xx-unavailable and seo-tech-robots-5xx-disallow with section citations."),
    ),
    "seo-onpage-heading-structure": dict(
        status="revised",
        confidence="high",
        knowledgeType="authoritative",
        claimType="official_recommendation",
        principle=(
            "Headings give readers and assistive technology a structural outline of a page, and Google recommends "
            "organising content with paragraphs, sections and headings that provide a clear structure to navigate. "
            "Google states separately that heading order does not matter from a Google Search perspective and that "
            "there is no ideal number of headings."
        ),
        explanation=(
            "Recommend headings for reader navigation and accessibility. Do not present heading count or order as a "
            "Google Search requirement - Google's starter guide explicitly says it does not matter to Search."
        ),
        limitations=(
            "Google states plainly that using headings out of order does not matter from a Google Search "
            "perspective, and that there is no magical, ideal amount of headings. Semantic order does matter for "
            "screen readers."
        ),
        quote=("Having your headings in semantic order is fantastic for screen readers, but from Google Search "
               "perspective, it doesn't matter if you're using them out of order."),
        location="Section: Things we believe you shouldn't focus on - Number and order of headings",
        verified=True, sourceSupport="direct",
        note=("Revised. The seed item asserted a single-H1 convention and cited an unsourced Google statement about "
              "multiple H1s. The starter guide read in this pass makes a stronger, directly quotable claim about "
              "heading order and count, which replaces it. See myth-heading-order-and-count."),
    ),
    "geo-google-same-index": dict(
        status="revised",
        principle=(
            "To be eligible as a supporting link in AI Overviews or AI Mode, a page must be indexed and eligible to "
            "be shown in Google Search with a snippet, meeting the Search technical requirements. Google's "
            "generative AI guidance adds that, in addition to those technical requirements, a site must be included "
            "in Search generative AI features in Search Console to be eligible for display."
        ),
        explanation=(
            "Standard indexability and snippet eligibility remain the entry conditions, so GEO advice builds on the "
            "same deterministic checks. There is now also a Search Console condition that a crawl cannot observe "
            "and which must be raised as a manual check."
        ),
        limitations=(
            "Eligibility is never a guarantee of inclusion, and this documents Google's features only. The "
            "Search Console inclusion condition cannot be verified from a crawl. The seed version of this item "
            "stated there were no additional technical requirements; the 2026-07-10 guidance adds one."
        ),
        confidence="high",
        quote=("In addition to the technical requirements for Search, a site must be included in Search generative "
               "AI features in Search Console to be eligible for display in generative AI features on Google Search."),
        location="Section: Build and maintain a clear technical structure - Meet the Search technical requirements",
        source_override=dict(
            name="Optimizing your website for generative AI features on Google Search",
            publisher="Google Search Central",
            url="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
            type="official",
            localPath="knowledge/raw/geo/Optimizing for Generative AI Features on Google Search (Google Search Central).pdf",
            lastUpdated="2026-07-10",
            accessedDate="2026-09-22",
        ),
        verified=True, sourceSupport="direct",
        note=("Revised and RE-SOURCED. The seed cited 'Google - AI Features and Your Website', which is not "
              "archived in knowledge/raw/ and was not read in this pass. The claim as now written is taken from "
              "the AI optimization guide (last updated 2026-07-10), which was read in full and adds a Search "
              "Console inclusion condition the seed did not record. See geo-google-eligibility-conditions and "
              "conflict-ai-eligibility-extra-requirements."),
    ),
    "geo-research-citation-quotation-stats": dict(
        status="revised",
        confidence="medium",
        principle=(
            "In the Aggarwal et al. GEO benchmark, the best-performing methods improved on the no-optimisation "
            "baseline by 41% on Position-Adjusted Word Count and 28% on Subjective Impression. The authors report "
            "that Cite Sources, Quotation Addition and Statistics Addition achieved relative improvements of 30-40% "
            "on Position-Adjusted Word Count and 15-30% on Subjective Impression."
        ),
        explanation=(
            "Treat this as experimental evidence that verifiable, attributable content was easier for the tested "
            "pipeline to surface. It is not a guaranteed uplift and was not measured on Google's AI features."
        ),
        limitations=(
            "The headline figures come from a researcher-built pipeline - top 5 Google results summarised by "
            "gpt-3.5-turbo - not a commercial product, using metrics the authors defined themselves. On the "
            "deployed Perplexity.ai engine the best measured lift was 22% on the primary metric. Effects varied "
            "strongly by the source's existing search rank and by subject domain."
        ),
        verified=True, sourceSupport="direct",
        location="Section 4 (Results), Table 1",
        quote=("The best methods improve upon baseline by 41% and 28% on Position-Adjusted Word Count and "
               "Subjective Impression respectively."),
        note=("Revised against the paper. The seed item attributed ~41% to Quotation Addition and ~30% to Cite "
              "Sources; the paper reports 41% as the best method overall and gives a 30-40% band for the three "
              "top methods. The simulated-engine caveat has been added."),
    ),
    "geo-research-fluency-and-combination": dict(
        status="revised",
        confidence="medium",
        limitations=(
            "Measured on GEO-bench with the authors' own visibility metrics, using a simulated engine rather than a "
            "production one. The method-combination result specifically was computed on a 200-example subset of the "
            "test split, which the authors state is not comparable with their main table. Generalisation to current "
            "production engines is unproven."
        ),
        verified=True, sourceSupport="direct",
        location="Section 4 (Results); Section 5.3 Combination of GEO Strategies, Figure 4 and footnote 4",
        quote=("stylistic changes such as improving fluency and readability of the source text [...] also "
               "resulted in a significant visibility boost of 15-30%."),
        note="Revised to record the 200-example subset behind the combination figure. See geo-research-combination-subset.",
    ),
    "geo-research-keyword-stuffing-ineffective": dict(
        status="revised",
        confidence="medium",
        principle=(
            "Keyword stuffing was among the strategies tested in the GEO benchmark that did not produce visibility "
            "gains. On the simulated engine it scored below the no-optimisation baseline on Position-Adjusted Word "
            "Count, and on the deployed Perplexity.ai engine the authors report it performed 10% worse than "
            "baseline on that metric."
        ),
        limitations=(
            "Negative results from one benchmark and one deployed engine before June 2024; absence of measured "
            "benefit is not proof of harm or of universality. On the Perplexity evaluation keyword stuffing scored "
            "above baseline on the Subjective Impression metric even while scoring below it on the primary metric, "
            "so the two metrics disagree."
        ),
        verified=True, sourceSupport="direct",
        location="Section 4 (Results), Table 1; Section 6 (GEO in the Wild), Table 5",
        quote=("we find such methods offer little to no improvement on generative engine's responses."),
        note="Revised with the Perplexity figures and the disagreement between the paper's two metrics.",
    ),
    "geo-research-token-level-edits-contested": dict(
        status="needs_verification",
        confidence="low",
        verified=False, sourceSupport="insufficient",
        note=("UNVERIFIED. The cited arXiv preprint URL was not confirmed in this pass and the seed record has no "
              "URL. The v1 README flags this item as verify-or-delete. Do not use in user-facing output until a "
              "real citation is attached."),
    ),
    "seo-content-search-intent-taxonomy": dict(
        status="revised",
        knowledgeType="research",
        claimType="experimental_result",
        confidence="medium",
        explanation=(
            "Broder's three-class model is the origin of the intent taxonomy used throughout SEO. It is "
            "peer-reviewed research, not search-engine documentation, so it should be cited as a research-backed "
            "framing rather than an official one. Google's own rater guidelines use a different and more recent "
            "operational taxonomy - Know, Know Simple, Do, Website and Visit-in-person - which should be preferred "
            "when an official framing is needed. Commercial-investigation is a later industry addition to Broder's "
            "model and belongs to neither."
        ),
        limitations=(
            "A single query can carry mixed intent, and Broder states explicitly that intent cannot be inferred "
            "with any certitude from the query. The paper's data is from AltaVista in 2001. Intent distributions "
            "shift over time and by market."
        ),
        location="Section 3 (A taxonomy of web searches)",
        verified=True, sourceSupport="direct",
        note=("Reclassified from 'authoritative' to 'research'. The seed marked a peer-reviewed academic paper as "
              "authoritative, which contradicts the corpus rule that only official and standards sources carry "
              "that class. Confidence lowered from high to medium accordingly. See "
              "seo-content-google-intent-taxonomy for the official alternative."),
    ),
    "myth-domain-authority-ranking-factor": dict(
        status="revised",
        confidence="high",
        principle=(
            "Claim: a third-party authority score is used by Google. Reality: Google states that no third-party "
            "tool has access to its internal ranking or AI systems, and warns against tools that promise ranking "
            "success or claim to use internal Google metrics. Vendor authority scores model observed link data; "
            "they are not Google metrics."
        ),
        limitations=(
            "Google's statement is about third-party tools and internal metrics generally; it does not name any "
            "specific vendor score. Vendor metrics can still be useful for relative comparison when labelled by "
            "vendor."
        ),
        quote="No third-party tool has access to our internal ranking or AI systems.",
        location="Section: Measure visibility in generative AI features with Search Console",
        source_override=dict(
            name="Optimizing your website for generative AI features on Google Search",
            publisher="Google Search Central",
            url="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
            type="official",
            localPath="knowledge/raw/geo/Optimizing for Generative AI Features on Google Search (Google Search Central).pdf",
            lastUpdated="2026-07-10",
            accessedDate="2026-09-22",
        ),
        verified=True, sourceSupport="direct",
        note=("Re-sourced. The seed item cited the helpful-content page, which says nothing about third-party "
              "metrics - the seed's own limitations field admitted this. The AI optimization guide read in this "
              "pass supports the claim directly."),
    ),
}

# Seed items whose source WAS read in this pass and whose content checked out
# unchanged. Marked verified with no text edits.
VERIFIED_UNCHANGED = {
    "seo-content-people-first-assessment": ("Section: Self-assess your content", None),
    "seo-content-ai-generated-content-stance": ("Section: Why (was the content created)", None),
    "myth-ai-content-cannot-rank": ("Section: Why (was the content created)", None),
    "seo-content-eeat-framework": ("Section 3.4 E-E-A-T, pages 26-27", None),
    "seo-content-ymyl": ("Section 2.3 YMYL Topics, pages 11-12", None),
    "seo-content-search-intent-taxonomy": ("Section 3 (A taxonomy of web searches)", None),
    "seo-content-no-ideal-word-count": (
        "Section: Mythbusting generative AI search - \"Chunking\" content",
        "There's no ideal page length, and in the end, make pages for your audience, not just for generative AI search.",
    ),
    "myth-more-words-rank-better": (
        "Section: Mythbusting generative AI search - \"Chunking\" content",
        "There's no ideal page length.",
    ),
    "geo-google-rag-query-fanout": (
        "Section: Is SEO still relevant for generative AI search?",
        "Query fan-out: A set of concurrent, related queries generated by the model to request more information and fetch additional relevant search results to address the user's query.",
    ),
    "geo-google-mythbusting": (
        "Section: Mythbusting generative AI search",
        "Here are a few things you can ignore for Google Search:",
    ),
    "seo-il-internal-links-discovery": ("Section: Link to relevant resources", None),
    "seo-il-anchor-text-descriptive": ("Section: Write good link text", None),
}


def host_of(url):
    if not url:
        return ""
    try:
        return url.split("//", 1)[1].split("/", 1)[0]
    except Exception:
        return ""


def sentences(text):
    out, cur = [], ""
    for ch in text:
        cur += ch
        if ch in ".;":
            s = cur.strip()
            if len(s) > 15:
                out.append(s.rstrip(".;").strip())
            cur = ""
    s = cur.strip()
    if len(s) > 15:
        out.append(s.rstrip(".;").strip())
    return out or [text.strip()]


def migrate(seed_items):
    out = []
    for s in seed_items:
        sid = s["id"]
        ov = VERIFIED_OVERRIDES.get(sid, {})
        src = dict(s["source"])
        if "source_override" in ov:
            src = dict(ov["source_override"])

        url = src.get("url")
        verified = ov.get("verified")
        if verified is None:
            verified = sid in VERIFIED_UNCHANGED or any(
                m in (url or "") for m in VERIFIED_SOURCE_MARKERS)

        loc, quote = VERIFIED_UNCHANGED.get(sid, (None, None))
        loc = ov.get("location", loc)
        quote = ov.get("quote", quote)

        kt = ov.get("knowledgeType", s["knowledgeType"])
        conf = ov.get("confidence", s["confidence"])
        stype = src["type"]

        topic = s["topic"]
        applic = s["applicability"]

        applies = [APPLICABILITY_PHRASE.get(a, a.replace("_", " ").capitalize())
                   for a in applic]
        not_applies = sentences(ov.get("limitations", s["limitations"]))

        item = {
            "id": sid,
            "domain": s["domain"],
            "category": s["category"],
            "topic": topic,
            "subtopic": None,
            "knowledgeType": kt,
            "claimType": ov.get("claimType", CLAIM_TYPE_BY_KT[kt]),
            "title": ov.get("title", s["title"]),
            "principle": ov.get("principle", s["principle"]),
            "explanation": ov.get("explanation", s["explanation"]),
            "whyItMatters": ov.get("whyItMatters", s["explanation"]),
            "appliesWhen": applies,
            "doesNotApplyWhen": not_applies,
            "entities": TOPIC_ENTITIES.get(topic, ["page"]),
            "relatedIssues": [],
            "checks": TOPIC_CHECKS.get(topic, ["none"]),
            "recommendedAction": ov.get("recommendedAction", s["explanation"]),
            "applicability": applic,
            "evidenceType": EVIDENCE_TYPE_BY_SRC[stype],
            "evidenceStrength": EVIDENCE_STRENGTH.get((stype, conf), "unknown"),
            "confidence": conf,
            "source": {
                "name": src["name"],
                "publisher": src.get("publisher") or PUBLISHER_BY_HOST.get(host_of(url), "Unknown"),
                "url": url,
                "type": stype,
                "location": loc,
                "quote": quote,
                "localPath": src.get("localPath"),
                "publishedDate": src.get("publishedDate"),
                "lastUpdated": src.get("lastUpdated"),
                "accessedDate": "2026-09-22" if verified else None,
            },
            "limitations": ov.get("limitations", s["limitations"]),
            "relatedKnowledge": [],
            "tags": [topic, s["category"], s["domain"]],
            "provenance": {
                "sourceSupport": ov.get("sourceSupport", "direct" if verified else "derived"),
                "modelInterpretation": None,
                "extractionPass": "seed-v1",
                "verifiedAgainstLocalSource": bool(verified),
            },
            "version": s["version"],
            "lastVerified": "2026-09-22" if verified else s["lastVerified"],
            "reviewBy": "2027-03-22" if verified else "2026-12-22",
            "potentiallyOutdated": not verified,
            "status": ov.get("status", "active"),
        }
        if "supersededBy" in ov:
            item["supersededBy"] = ov["supersededBy"]
        if "note" in ov:
            item["provenance"]["migrationNote"] = ov["note"]
        if not verified:
            item["provenance"]["migrationNote"] = (
                "Carried forward from the v1 seed. Its source document is not in knowledge/raw/, so it was NOT "
                "re-read in this extraction pass. No quote or source location is recorded because none was "
                "verified. Re-verify before relying on it for a high-stakes recommendation.")
        out.append(item)
    return out
