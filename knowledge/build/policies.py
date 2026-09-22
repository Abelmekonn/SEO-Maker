# -*- coding: utf-8 -*-
"""Resolved policies.

Every conflict found during extraction has been DECIDED. Each policy states the
decision, the directive the AI layer must follow, and the phrasing it must not
use. These are consumed directly - there is no separate conflicts document.

`losingClaim` is kept so the model can recognise and contradict the rejected
position when a user or a third-party report raises it.
"""

POLICIES = [
    {
        "id": "policy-ai-eligibility",
        "question": "What does a page actually need to be eligible for Google's AI features?",
        "decision": (
            "Three conditions, all required: the page is indexed; it is eligible to be shown with a snippet; and "
            "the site is included in Search generative AI features in Search Console."
        ),
        "rationale": (
            "Google's generative-AI guide (last updated 2026-07-10) is the most recently updated source and was "
            "read in full. It adds the Search Console condition that older guidance did not mention. The older "
            "position - that no special markup or AI-specific optimisation is needed - is not contradicted and is "
            "retained."
        ),
        "directive": (
            "Verify indexability and snippet eligibility from the crawl. Then tell the user to confirm Search "
            "Console inclusion themselves, stating plainly that SEO Maker cannot check it. Never report a GEO "
            "readiness result as complete without naming that unchecked condition."
        ),
        "neverSay": [
            "There are no additional requirements beyond normal indexing.",
            "Your site is eligible for AI Overviews. (SEO Maker cannot establish this.)",
        ],
        "losingClaim": "No additional technical requirements exist beyond ordinary indexing and snippet eligibility.",
        "appliesToItems": ["geo-google-eligibility-conditions", "geo-google-same-index",
                           "geo-google-indexing-not-guaranteed"],
        "appliesToChecks": ["indexability", "robots", "status"],
        "confidence": "high",
    },
    {
        "id": "policy-geo-content-tactics",
        "question": "Which GEO content tactics should SEO Maker recommend?",
        "decision": (
            "Recommend verifiable substance - sources, quotations, data - and answer-first structure justified by "
            "reader benefit. Do not recommend rewriting content to sound more authoritative."
        ),
        "rationale": (
            "The only controlled measurement of an authoritative-tone rewrite found no significant improvement. "
            "The same study found citations, quotations and statistics did help. Answer-first structure survives "
            "because Google independently endorses clear paragraphs, sections and headings for readers - but its "
            "supposed extraction mechanism is unconfirmed, so reader benefit is the only justification available."
        ),
        "directive": (
            "Recommend adding sources, direct quotations and concrete data where claims are unsupported. "
            "Recommend stating the answer early and using clear headings, framed as helping readers. Decline "
            "tone-rewriting requests and explain that the measurement found no effect."
        ),
        "neverSay": [
            "Rewrite this in a more authoritative voice to improve AI visibility.",
            "Answer-first structure makes your content easier for AI to extract. (No engine has confirmed this.)",
        ],
        "losingClaim": "Writing in a more persuasive, authoritative style increases generative-engine visibility.",
        "appliesToItems": ["geo-research-authoritative-tone-ineffective", "geo-heuristic-answer-first-structure",
                           "geo-google-organize-content-for-readers", "geo-research-citation-quotation-stats"],
        "appliesToChecks": ["none"],
        "confidence": "medium",
    },
    {
        "id": "policy-geo-effect-sizes",
        "question": "May SEO Maker quote GEO effect sizes to users?",
        "decision": "No. Describe direction, never a percentage.",
        "rationale": (
            "The widely quoted 40% comes from a pipeline the researchers built - top 5 Google results summarised "
            "by gpt-3.5-turbo - scored with metrics they defined themselves. On a real deployed engine the best "
            "result was 22%, and some methods reached only 9%. The effect also reversed by rank: low-ranked "
            "sources gained, the top-ranked source lost. A single number cannot honestly represent that."
        ),
        "directive": (
            "Say that adding sources and data was measured to help content surface in generative engines, without "
            "attaching a figure. If a user cites a percentage, name the engine, the metric and the date it was "
            "measured on, and note that the benefit concentrated in lower-ranked pages."
        ),
        "neverSay": [
            "GEO tactics boost visibility by up to 40%.",
            "This change will increase your AI visibility by X%.",
        ],
        "losingClaim": "GEO methods reliably boost visibility by around 40% in generative engines.",
        "appliesToItems": ["geo-research-engine-was-simulated", "geo-research-perplexity-replication",
                           "geo-research-rank-dependency", "geo-research-citation-quotation-stats",
                           "geo-research-combination-subset"],
        "appliesToChecks": ["none"],
        "confidence": "high",
    },
    {
        "id": "policy-headings",
        "question": "How should the h1 and h2 checks be reported?",
        "decision": (
            "As readability and accessibility observations. Never as a Google Search requirement or a ranking issue."
        ),
        "rationale": (
            "Google states directly that heading order does not matter from a Google Search perspective and that "
            "there is no ideal number of headings. The single-H1 rule comes from accessibility practice, where "
            "semantic order genuinely matters, and was then misreported as a search requirement."
        ),
        "directive": (
            "Keep running the h1 and h2 checks. Report a missing H1 as 'this page has no clear top-level heading "
            "for readers', and report heading structure as helping navigation and assistive technology. Lower the "
            "severity accordingly - this is not a ranking defect."
        ),
        "neverSay": [
            "Pages must have exactly one H1.",
            "Skipped heading levels hurt your rankings.",
            "Google requires a proper heading hierarchy.",
        ],
        "losingClaim": "A page needs exactly one H1 and strictly ordered heading levels for Google.",
        "appliesToItems": ["myth-heading-order-and-count", "seo-onpage-heading-structure",
                           "geo-google-organize-content-for-readers"],
        "appliesToChecks": ["h1", "h2"],
        "confidence": "high",
    },
    {
        "id": "policy-title-meta-length",
        "question": "How should title and meta description length be reported?",
        "decision": "As truncation risk only. Never as a pass/fail rule, and never as the lead finding.",
        "rationale": (
            "Google's title-link and snippet documentation specify no character limit. The stated title criteria "
            "are that it is unique to the page, clear, concise and accurately describes the content. Character "
            "ranges are display-truncation heuristics derived from SERP pixel budgets, which vary by device and "
            "character shape."
        ),
        "directive": (
            "Lead with the documented criteria: is the title unique, clear, and accurate to what the page actually "
            "contains? Mention length only as 'this may be truncated in results', and advise putting the "
            "distinctive words first rather than hitting a count."
        ),
        "neverSay": [
            "Your title is too long. Keep it under 60 characters.",
            "Meta descriptions must be 120-160 characters.",
        ],
        "losingClaim": "Titles must be 50-60 characters and meta descriptions 120-160 characters.",
        "appliesToItems": ["seo-onpage-title-quality-criteria", "seo-onpage-title-no-official-limit",
                           "seo-onpage-meta-description-no-limit", "seo-onpage-meta-description-criteria",
                           "myth-title-character-limit", "myth-meta-description-character-limit",
                           "seo-onpage-title-truncation-heuristic"],
        "appliesToChecks": ["title", "meta"],
        "confidence": "high",
    },
    {
        "id": "policy-word-count",
        "question": "How should the word-count threshold be reported?",
        "decision": "As an internal trigger only. Never surface the number or the threshold to the user.",
        "rationale": (
            "Three separate Google documents deny a preferred word count - 'No, we don't', 'no magical word count "
            "target', 'no ideal page length'. A threshold is still needed to make thinness computable, but it "
            "detects a candidate problem rather than defining a standard the page must meet."
        ),
        "directive": (
            "When the threshold fires, read the page and report what is actually missing: an unanswered part of "
            "the topic, no first-hand detail, no supporting evidence. If the page is functional - a login, a "
            "converter, a category page - suppress the finding entirely, because page type does not determine "
            "quality."
        ),
        "neverSay": [
            "This page is under 300 words.",
            "Expand this page past 300 words.",
            "Google prefers longer content.",
        ],
        "losingClaim": "Pages need a minimum word count to perform in search.",
        "appliesToItems": ["seo-content-no-word-count-target-starter", "seo-content-no-preferred-word-count",
                           "seo-content-no-ideal-word-count", "myth-more-words-rank-better",
                           "seo-qrg-page-type-not-quality", "seo-qrg-mc-quality-dimensions",
                           "seo-qrg-filler-placement"],
        "appliesToChecks": ["words"],
        "confidence": "high",
    },
    {
        "id": "policy-4xx-removal",
        "question": "Should 410 be recommended over 404 to remove a page faster?",
        "decision": "No. Recommend whichever status code is semantically correct, and make no speed claim.",
        "rationale": (
            "Google's documentation treats all 4xx codes except 429 identically for index removal. The belief that "
            "410 is faster is long-standing practitioner convention, not current documentation."
        ),
        "directive": (
            "Use 410 when the resource is permanently gone and 404 when it is simply not found. Do not attach a "
            "removal-speed expectation to either. For urgent removal, point the user at Search Console's removal "
            "tool instead."
        ),
        "neverSay": ["Return 410 instead of 404 to deindex this page faster."],
        "losingClaim": "410 Gone removes pages from the index faster than 404 Not Found.",
        "appliesToItems": ["seo-tech-http-4xx-equivalence", "myth-410-faster-than-404",
                           "seo-tech-http-2xx-3xx-handling"],
        "appliesToChecks": ["status"],
        "confidence": "medium",
        "caveat": (
            "The supporting Google document is not archived in raw/ and was not re-read in this pass. The decision "
            "is safe either way, since it recommends semantic correctness rather than relying on the speed claim."
        ),
    },
]
