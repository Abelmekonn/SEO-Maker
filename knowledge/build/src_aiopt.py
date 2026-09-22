# -*- coding: utf-8 -*-
"""Knowledge from Google's 'Optimizing for generative AI features' guide (updated 2026-07-10).

This is the most recently updated source in the corpus and it revises two seed items:
  - geo-google-same-index  (adds a Search Console inclusion condition)
  - geo-google-mythbusting (the mythbusting list is longer than the seed recorded)
"""

from common import item, AIOPT

COMMON = dict(
    domain="geo", source=AIOPT,
    evidenceType="official_documentation", evidenceStrength="strong", confidence="high",
    version="Google Search Central, last updated 2026-07-10", reviewBy="2027-01-22",
)


def it(**kw):
    return item(**{**COMMON, **kw})


ITEMS = [
    it(
        id="geo-google-ai-rooted-in-core-search",
        category="retrieval", topic="google_ai_features", subtopic="relationship_to_seo",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google's generative AI features run on its core Search ranking and quality systems",
        principle=(
            "Google states that SEO best practices continue to be relevant because its generative AI features on "
            "Google Search are rooted in its core Search ranking and quality systems, and that these features use AI "
            "techniques to highlight content from the Search index. It adds that from Google Search's perspective, "
            "optimizing for generative AI search is optimizing for the search experience, and thus still SEO."
        ),
        explanation=(
            "SEO Maker's GEO module should therefore build on the same deterministic checks as its SEO module, not "
            "a parallel ruleset. There is no separate technical discipline to sell."
        ),
        whyItMatters=(
            "It is the anchor fact for the whole GEO area: it tells the AI layer to reuse existing evidence rather "
            "than invent AI-specific requirements."
        ),
        appliesWhen=[
            "A user asks how to appear in AI Overviews or AI Mode",
            "Deciding whether a GEO finding needs its own check or reuses an SEO one",
            "Evaluating third-party AEO or GEO advice",
        ],
        doesNotApplyWhen=[
            "AI assistants outside Google, which have not made equivalent statements",
            "Claiming that ranking in classic results guarantees inclusion in an AI response",
        ],
        entities=["site", "page", "content"],
        relatedIssues=["AI visibility questions", "GEO strategy questions"],
        checks=["indexability", "status", "robots_audit"],
        recommendedAction=(
            "Answer AI-visibility questions with the site's existing SEO evidence, and say explicitly that Google "
            "treats generative AI optimisation as SEO."
        ),
        applicability=["geo_analysis", "technical_audit", "site_audit", "myth_guard"],
        limitations=(
            "This describes Google's features only. Other AI assistants retrieve differently, and Google does not "
            "publish how sources are selected among eligible results."
        ),
        relatedKnowledge=["geo-google-same-index", "geo-google-eligibility-conditions", "geo-google-rag-query-fanout"],
        tags=["ai_overviews", "ai_mode", "geo", "aeo"],
        location="Section: Is SEO still relevant for generative AI search?",
        quote="From Google Search's perspective, optimizing for generative AI search is optimizing for the search experience, and thus still SEO.",
    ),
    it(
        id="geo-google-eligibility-conditions",
        category="retrieval", topic="google_ai_features", subtopic="eligibility",
        knowledgeType="authoritative", claimType="official_requirement",
        title="Eligibility for Google's AI features needs indexing, snippet eligibility, and Search Console inclusion",
        principle=(
            "Google states that to be eligible to be shown in generative AI features on Google Search, a page must "
            "be indexed and eligible to be shown in Google Search with a snippet, fulfilling the Search technical "
            "requirements. It adds that in addition to those technical requirements, a site must be included in "
            "Search generative AI features in Search Console to be eligible for display."
        ),
        explanation=(
            "There are three conditions, and the third is a Search Console setting rather than an on-site property. "
            "SEO Maker can verify the first two from a crawl but cannot observe the third, so it should name it as "
            "a manual check the user must perform."
        ),
        whyItMatters=(
            "The Search Console condition is newer than most GEO advice in circulation. A site can be perfectly "
            "indexable and still be ineligible, and no crawl-based tool can detect that."
        ),
        appliesWhen=[
            "A user asks why their content does not appear in AI Overviews or AI Mode",
            "Producing a GEO readiness assessment",
            "A page carries nosnippet or max-snippet directives",
        ],
        doesNotApplyWhen=[
            "Non-Google AI assistants",
            "Treating eligibility as a guarantee of appearing - Google states indexing and serving are not guaranteed",
        ],
        entities=["site", "page", "technical_configuration"],
        relatedIssues=["not appearing in AI Overviews", "nosnippet blocking AI eligibility", "AI feature eligibility"],
        checks=["indexability", "robots", "status"],
        recommendedAction=(
            "Verify indexability and snippet eligibility from the crawl, then tell the user to confirm the site's "
            "inclusion in Search generative AI features in Search Console, which the tool cannot check."
        ),
        applicability=["geo_analysis", "technical_audit", "indexability_analysis", "site_audit"],
        limitations=(
            "Meeting all conditions does not guarantee appearance. Google states plainly that meeting requirements "
            "does not mean it will crawl, index or serve the content. This condition is specific to Google."
        ),
        relatedKnowledge=["geo-google-same-index", "geo-google-indexing-not-guaranteed", "seo-onpage-snippet-controls"],
        tags=["ai_overviews", "ai_mode", "eligibility", "search_console"],
        location="Section: Build and maintain a clear technical structure - Meet the Search technical requirements",
        quote="In addition to the technical requirements for Search, a site must be included in Search generative AI features in Search Console to be eligible for display in generative AI features on Google Search.",
    ),
    it(
        id="geo-google-indexing-not-guaranteed",
        category="retrieval", topic="google_ai_features", subtopic="no_guarantee",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Meeting every requirement does not guarantee crawling, indexing or serving",
        principle=(
            "Google states that just because a page meets all requirements, best practices and policies does not "
            "mean Google will crawl, index or serve its content - indexing and serving are not guaranteed."
        ),
        explanation=(
            "This is the caveat that belongs on any recommendation SEO Maker makes about visibility. The tool can "
            "remove obstacles; it cannot promise outcomes."
        ),
        whyItMatters=(
            "It is the single clearest first-party statement against outcome promises, and it applies to SEO and "
            "GEO recommendations alike."
        ),
        appliesWhen=[
            "Phrasing the expected result of any indexing or visibility recommendation",
            "A user asks whether a fix will get them indexed or cited",
        ],
        doesNotApplyWhen=[
            "Reporting a verifiable current state, such as the page's status code or robots directives",
        ],
        entities=["page", "site"],
        relatedIssues=["page not indexed", "outcome expectations"],
        checks=["indexability", "status"],
        recommendedAction=(
            "Phrase recommendations as removing obstacles and improving the chance of inclusion, never as "
            "guaranteeing indexing, ranking or citation."
        ),
        applicability=["reporting_language", "geo_analysis", "indexability_analysis", "prioritisation"],
        limitations=(
            "A statement about guarantees, not about likelihood. Following the requirements does still make "
            "inclusion more likely."
        ),
        relatedKnowledge=["geo-google-eligibility-conditions", "seo-tech-change-latency"],
        tags=["indexing", "expectations", "reporting_language"],
        location="Section: Build and maintain a clear technical structure",
        quote="Just because a page meets all requirements, best practices, and complies with the policies, doesn't mean that Google will crawl, index, or serve its content. Indexing and serving aren't guaranteed.",
    ),
    it(
        id="geo-google-non-commodity-content",
        category="content_structure", topic="content_value", subtopic="non_commodity",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Non-commodity content with a unique point of view is Google's top generative-AI recommendation",
        principle=(
            "Google states that creating content people find unique, compelling and useful will likely influence a "
            "site's presence in generative AI search more than any other suggestion in its guide. It contrasts "
            "commodity content based on common knowledge - its example is \"7 Tips for First-Time Homebuyers\" - with "
            "non-commodity content offering unique expert or experienced takes, exemplified by \"Why We Waived the "
            "Inspection & Saved Money: A Look Inside the Sewer Line\". It adds that a first-hand review provides a "
            "unique perspective, whereas a summary of existing content simply restates what is already available, "
            "and advises not recycling what others have said or what a generative AI model could easily produce."
        ),
        explanation=(
            "This is the most specific first-party content guidance available for AI visibility, and it is "
            "assessable from page content: does this page contain something only this author could have written?"
        ),
        whyItMatters=(
            "It replaces vague GEO structural advice with a concrete, quotable content test, ranked by Google above "
            "every technical suggestion in the same guide."
        ),
        appliesWhen=[
            "A page restates widely available information without first-hand input",
            "A user asks how to improve their chances of appearing in AI answers",
            "Generating content recommendations for a competitive informational topic",
        ],
        doesNotApplyWhen=[
            "Pages whose purpose is functional, transactional or navigational rather than informational",
            "Reference pages where restating established facts accurately is the point",
        ],
        entities=["content", "page", "site"],
        relatedIssues=["commodity content", "derivative content", "no first-hand experience"],
        checks=["words"],
        recommendedAction=(
            "Identify what first-hand experience, data or perspective the author has that the page does not yet "
            "show, and recommend adding that rather than restructuring or lengthening the page."
        ),
        applicability=["geo_analysis", "content_analysis", "page_audit"],
        limitations=(
            "Google describes influence in the long run and gives no measurement. Judging commodity versus "
            "non-commodity requires reading the content and knowing the topic."
        ),
        relatedKnowledge=["seo-content-self-assessment-questions", "seo-qrg-mc-quality-dimensions", "seo-content-starter-quality-attributes"],
        tags=["content_value", "originality", "first_hand_experience", "geo"],
        location="Section: Create valuable, non-commodity content for your audience",
        quote="Don't just recycle what others on the internet have already said, or could easily be produced by a generative AI model.",
    ),
    it(
        id="geo-google-organize-content-for-readers",
        category="content_structure", topic="content_organization", subtopic="readability",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Organise content with paragraphs, sections and headings for readers, not for machines",
        principle=(
            "Google advises writing content for a human audience, making sure it is well written and easy to "
            "follow, and notes that people generally appreciate web pages organised by paragraphs and sections with "
            "headings that provide a clear structure to navigate content."
        ),
        explanation=(
            "Structural advice is justified by reader benefit. This is the legitimate version of the popular claim "
            "that content should be restructured for AI extraction - Google endorses the structure, but for people."
        ),
        whyItMatters=(
            "It lets SEO Maker recommend headings and sectioning honestly while refusing the adjacent myth that "
            "content must be chunked for machines."
        ),
        appliesWhen=[
            "A page presents long unbroken content with no sectioning",
            "Recommending heading structure improvements",
        ],
        doesNotApplyWhen=[
            "Recommending structure specifically so AI systems can parse the page, which Google says is unnecessary",
            "Short pages where sectioning would add nothing",
        ],
        entities=["page", "content"],
        relatedIssues=["unstructured content", "no subheadings", "wall of text"],
        checks=["h2", "h1"],
        recommendedAction=(
            "Recommend paragraphs, sections and headings on the grounds of reader navigation, and say explicitly "
            "that machine-oriented chunking is not needed."
        ),
        applicability=["geo_analysis", "heading_analysis", "content_analysis", "page_audit"],
        limitations=(
            "Google states separately that heading order and count do not matter from a Search perspective, so this "
            "supports having structure, not a particular hierarchy."
        ),
        relatedKnowledge=["myth-heading-order-and-count", "geo-google-no-chunking", "geo-heuristic-answer-first-structure"],
        tags=["headings", "content_structure", "readability", "geo"],
        location="Section: Create valuable, non-commodity content for your audience",
        quote="People generally appreciate it when web pages are organized by paragraphs and sections, along with headings that provide a clear structure to navigate content.",
    ),
    it(
        id="geo-google-fanout-content-abuse",
        category="emerging_practices", topic="geo_tactics", subtopic="fanout_targeting",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Creating pages for fan-out query variations is scaled content abuse",
        principle=(
            "Google states that creating separate content for every possible variation of how people might search - "
            "including targeting fan-out queries - primarily to manipulate rankings or generative AI responses "
            "violates its scaled content abuse spam policy, and adds that it is an ineffective long-term strategy "
            "because a high quantity of pages does not make a site higher quality or more relevant."
        ),
        explanation=(
            "Fan-out is a retrieval mechanism, not a content plan. This closes off the most common tactical "
            "over-reaction to the query fan-out concept."
        ),
        whyItMatters=(
            "Query fan-out is widely discussed and the obvious wrong inference - build a page per sub-query - is "
            "named by Google as a spam policy violation. SEO Maker must never suggest it."
        ),
        appliesWhen=[
            "A user proposes creating pages per query variation or sub-question",
            "A site shows many near-duplicate pages differing only by keyword variant",
        ],
        doesNotApplyWhen=[
            "Genuinely distinct pages that serve materially different user needs",
        ],
        entities=["site", "content", "page"],
        relatedIssues=["keyword-variant page bloat", "scaled content abuse", "near-duplicate pages"],
        checks=["canonical", "words"],
        recommendedAction=(
            "Advise covering a topic properly on one page rather than splitting it across query-variant pages, and "
            "name the spam policy risk explicitly."
        ),
        applicability=["geo_analysis", "content_analysis", "spam_risk_analysis", "myth_guard"],
        limitations=(
            "The violation turns on primary purpose being manipulation. Google publishes no page-count threshold, "
            "so this supports reasoning rather than automated classification."
        ),
        relatedKnowledge=["geo-google-rag-query-fanout", "seo-qrg-scaled-content-abuse", "seo-content-vocabulary-variation"],
        tags=["query_fanout", "scaled_content", "spam_policy", "geo"],
        location="Section: Create valuable, non-commodity content for your audience",
        quote="While it might be tempting to create separate content for every possible variation of how people might search [...] doing so primarily to manipulate rankings or generative AI responses in Google Search violates Google's scaled content abuse spam policy.",
    ),
    it(
        id="geo-google-crawlable-content",
        category="retrieval", topic="crawling", subtopic="ai_grounding",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google's generative AI models ground responses on publicly accessible, crawlable content",
        principle=(
            "Google states that to maximise visibility in generative AI search features, site owners should ensure "
            "their content is crawlable, because Google Search generative AI models use publicly accessible, "
            "crawlable content to learn patterns and provide relevant, grounded responses."
        ),
        explanation=(
            "Crawlability is the prerequisite for AI visibility, which means robots.txt and rendering findings are "
            "GEO findings too. The same evidence serves both analyses."
        ),
        whyItMatters=(
            "It lets SEO Maker answer AI-visibility questions with technical evidence it already collects, rather "
            "than speculating about AI-specific factors."
        ),
        appliesWhen=[
            "Content is blocked by robots.txt or requires authentication",
            "A user asks why their content is not being used in AI answers",
            "Auditing a large or frequently updated site for crawl efficiency",
        ],
        doesNotApplyWhen=[
            "Content deliberately kept private, where exclusion is the intended outcome",
        ],
        entities=["site", "page", "content", "crawler"],
        relatedIssues=["content blocked from crawling", "gated content", "crawl budget"],
        checks=["robots", "robots_audit", "indexability", "crawl_plan"],
        recommendedAction=(
            "Report robots.txt blocks and rendering obstacles as AI-visibility findings as well as SEO findings, and "
            "point large or frequently updated sites at crawl budget guidance."
        ),
        applicability=["geo_analysis", "technical_audit", "crawl_analysis"],
        limitations=(
            "Crawlability is necessary, not sufficient. Google does not publish how it selects among crawlable "
            "sources when generating a response."
        ),
        relatedKnowledge=["geo-google-eligibility-conditions", "seo-tech-render-resources-must-be-crawlable"],
        tags=["crawling", "grounding", "geo", "robots.txt"],
        location="Section: Build and maintain a clear technical structure",
        quote="ensure your content is crawlable, as Google Search generative AI models use publicly accessible, crawlable content to learn patterns and provide relevant, grounded responses.",
    ),
    it(
        id="geo-google-semantic-html-not-required",
        category="machine_readability", topic="semantic_html", subtopic="requirement",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Perfect semantic HTML is not required; Google can understand imperfect markup",
        principle=(
            "Google states that it is not required to have perfectly semantic HTML - noting the web in general is "
            "not valid HTML and Google can understand it - while adding that it is generally a good idea to use "
            "semantic HTML where possible because it helps other users such as screen readers parse and navigate "
            "the page."
        ),
        explanation=(
            "Markup validity findings should be reported as accessibility and maintainability improvements, not as "
            "search or AI requirements."
        ),
        whyItMatters=(
            "HTML validation findings are easy to generate in volume and easy to overstate. Google's own position "
            "keeps their severity honest."
        ),
        appliesWhen=[
            "A page uses non-semantic markup such as div-based structure",
            "A user asks whether HTML validity affects search or AI visibility",
        ],
        doesNotApplyWhen=[
            "Markup problems that actually prevent content from rendering or being parsed",
            "Accessibility audits, where semantic markup genuinely matters",
        ],
        entities=["page", "technical_configuration"],
        relatedIssues=["non-semantic markup", "HTML validation errors"],
        checks=["none"],
        recommendedAction=(
            "Report semantic HTML as an accessibility and agent-readiness improvement with low search severity, not "
            "as a requirement."
        ),
        applicability=["geo_analysis", "technical_audit", "page_audit", "myth_guard"],
        limitations=(
            "This concerns validity and semantics. Content that genuinely fails to render, or is hidden behind "
            "blocked resources, remains a real problem."
        ),
        relatedKnowledge=["geo-google-agentic-experiences", "myth-heading-order-and-count"],
        tags=["semantic_html", "accessibility", "geo", "myth_guard"],
        location="Section: Build and maintain a clear technical structure",
        quote="While it's not required to have perfectly semantic HTML (the web in general is not valid HTML, and Google can understand it), it's generally a good idea to try to use semantic HTML when possible.",
    ),
    it(
        id="geo-google-javascript-processable",
        category="machine_readability", topic="javascript", subtopic="rendering",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google can process JavaScript content as long as it is not blocked",
        principle=(
            "Google states that it is able to process content within JavaScript as long as it is not blocked, while "
            "noting that SEO on a site using JavaScript frameworks is generally more complex than on other kinds of "
            "sites, and pointing to its JavaScript SEO best practices."
        ),
        explanation=(
            "JavaScript is not inherently a barrier. The two things that matter are whether the scripts are "
            "reachable and whether the rendered result contains the content."
        ),
        whyItMatters=(
            "It prevents blanket warnings against JavaScript frameworks while preserving the real finding - blocked "
            "scripts - which SEO Maker can actually detect."
        ),
        appliesWhen=[
            "A site renders main content with JavaScript",
            "A user asks whether their framework hurts SEO or AI visibility",
        ],
        doesNotApplyWhen=[
            "Cases where scripts are blocked by robots.txt, which is a genuine defect",
            "Content that never appears in the rendered DOM",
        ],
        entities=["page", "site", "technical_configuration"],
        relatedIssues=["JavaScript-rendered content", "blocked scripts", "empty rendered HTML"],
        checks=["robots", "indexability", "words"],
        recommendedAction=(
            "Check that scripts are not disallowed and that rendered output contains the main content, rather than "
            "advising against JavaScript."
        ),
        applicability=["geo_analysis", "technical_audit", "page_audit"],
        limitations=(
            "Google acknowledges JavaScript SEO is more complex and has its own guidance; processable does not mean "
            "problem-free or equally fast."
        ),
        relatedKnowledge=["seo-tech-render-resources-must-be-crawlable", "geo-google-crawlable-content"],
        tags=["javascript", "rendering", "geo"],
        location="Section: Build and maintain a clear technical structure",
        quote="Google is able to process content within JavaScript as long as it isn't blocked.",
    ),
    it(
        id="geo-google-page-experience",
        category="retrieval", topic="page_experience", subtopic="ai_arrivals",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Page experience matters for people arriving from AI features",
        principle=(
            "Google advises providing a good page experience for those who arrive at the site, including ensuring "
            "the site displays well across all devices, reducing latency, and making it easy for people to "
            "distinguish main content from other elements on the page."
        ),
        explanation=(
            "Three named components: cross-device display, latency, and main-content clarity. The third connects "
            "directly to the rater-guideline concern about filler and distracting ads."
        ),
        whyItMatters=(
            "It carries performance and layout findings into the GEO analysis with first-party justification, "
            "rather than leaving GEO as a content-only discussion."
        ),
        appliesWhen=[
            "Reporting performance or mobile rendering findings in a GEO context",
            "Main content is hard to distinguish from ads, navigation or promotional blocks",
        ],
        doesNotApplyWhen=[
            "Treating any single metric as the determinant of AI visibility",
        ],
        entities=["page", "site"],
        relatedIssues=["slow pages", "mobile rendering problems", "main content obscured"],
        checks=["none"],
        recommendedAction=(
            "Assess cross-device display, latency and main-content prominence together, and report them as page "
            "experience rather than as isolated metrics."
        ),
        applicability=["geo_analysis", "performance_analysis", "page_audit"],
        limitations=(
            "Google gives no thresholds here and does not state how page experience affects generative AI feature "
            "inclusion specifically."
        ),
        relatedKnowledge=["seo-content-page-experience-holistic", "seo-qrg-filler-placement", "seo-perf-core-web-vitals-set"],
        tags=["page_experience", "performance", "main_content", "geo"],
        location="Section: Build and maintain a clear technical structure",
        quote="This includes ensuring your site displays well across all devices, reducing latency, and making it easy for people to distinguish your main content from other elements on the page.",
    ),
    it(
        id="geo-google-local-ecommerce-feeds",
        category="retrieval", topic="local_and_ecommerce", subtopic="feeds_and_profiles",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Merchant Center feeds and Business Profiles support product and local visibility in AI responses",
        principle=(
            "Google states that generative AI responses can include product listings, product information and "
            "information about local businesses where appropriate, and that using Merchant Center - including "
            "Merchant Center feeds - and Google Business Profiles can help products and services be visible in both "
            "AI responses and other Google Search results."
        ),
        explanation=(
            "For commercial and local sites, some AI visibility depends on data supplied outside the website. SEO "
            "Maker cannot verify these from a crawl and should surface them as named off-site actions."
        ),
        whyItMatters=(
            "It is the only concrete, first-party local and ecommerce GEO guidance in the source set, and it points "
            "at work the crawl-based analysis would otherwise miss entirely."
        ),
        appliesWhen=[
            "The site sells products or serves a physical location",
            "Producing GEO recommendations for a local business or ecommerce site",
        ],
        doesNotApplyWhen=[
            "Purely informational or non-commercial sites",
            "Claiming a feed or profile guarantees inclusion in AI responses",
        ],
        entities=["business", "site", "structured_data"],
        relatedIssues=["no product feed", "no business profile", "local visibility"],
        checks=["schema"],
        recommendedAction=(
            "For commercial or local sites, recommend maintaining Merchant Center feeds and a Google Business "
            "Profile, and state clearly that these are off-site actions the audit cannot verify."
        ),
        applicability=["geo_analysis", "local_analysis", "ecommerce_analysis", "site_audit"],
        limitations=(
            "Google says these can help; it does not describe how the data is selected or weighted, and inclusion "
            "in AI responses is never guaranteed."
        ),
        relatedKnowledge=["geo-google-eligibility-conditions"],
        tags=["local_seo", "ecommerce", "merchant_center", "business_profile", "geo"],
        location="Section: Optimize your local business and ecommerce details",
        quote="Using products like Merchant Center (such as Merchant Center feeds) and Google Business Profiles can help your products and services to be visible in both AI responses and other Google Search results.",
    ),

    # ---------- the explicit mythbusting section ----------
    it(
        id="geo-google-no-special-files",
        category="machine_readability", topic="llms_txt", subtopic="special_files",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google Search does not use llms.txt or any special AI markup file",
        principle=(
            "Google states that you do not need to create new machine readable files, AI text files, markup or "
            "Markdown to appear in Google Search including its generative AI capabilities, because Google Search "
            "itself does not use them. It adds that creating and maintaining LLMS.txt files for other services is "
            "fine and will neither harm nor help visibility or rankings in Google Search, as Google Search ignores "
            "them."
        ),
        explanation=(
            "This is stronger than the seed item recorded: it covers any special machine-readable file or markup, "
            "not only llms.txt, and it explicitly states the neutral effect of publishing one anyway."
        ),
        whyItMatters=(
            "llms.txt is among the most heavily marketed GEO tactics. A direct first-party denial lets SEO Maker "
            "decline to recommend it while answering the question accurately."
        ),
        appliesWhen=[
            "A user asks about llms.txt or similar AI-oriented files",
            "A third-party GEO audit has recommended adding one",
            "The site already publishes an llms.txt",
        ],
        doesNotApplyWhen=[
            "Other AI providers, which have not made equivalent statements either way",
            "Advising removal of an existing file, since Google says it neither harms nor helps",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["llms.txt recommendations", "AI markup file proposals"],
        checks=["none"],
        recommendedAction=(
            "State that Google Search ignores these files. Do not list llms.txt as a fix or attach any expected "
            "benefit to it, and do not recommend removing one that already exists."
        ),
        applicability=["geo_analysis", "myth_guard", "technical_audit"],
        limitations=(
            "The statement covers Google Search only, and the proposal is actively discussed, so the position "
            "should be re-verified periodically."
        ),
        relatedKnowledge=["geo-llms-txt-status", "myth-llms-txt-improves-ai-visibility"],
        tags=["llms_txt", "myth_guard", "machine_readability", "geo"],
        location="Section: Mythbusting generative AI search - LLMS.txt files and other \"special\" markup",
        quote="You don't need to create new machine readable files, AI text files, markup, or Markdown to appear in Google Search (including its generative AI capabilities), as Google Search itself doesn't use them.",
    ),
    it(
        id="geo-google-no-chunking",
        category="machine_readability", topic="content_chunking", subtopic="requirement",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Content does not need chunking for AI, and there is no ideal page length",
        principle=(
            "Google states there is no requirement to break content into tiny pieces for AI to better understand it, "
            "that its systems can understand the nuance of multiple topics on a page and show the relevant piece to "
            "users, that sometimes shorter or longer pages work well depending on audience and subject, and that "
            "there is no ideal page length - pages should be made for the audience, not just for generative AI "
            "search."
        ),
        explanation=(
            "This rules out two popular tactics at once: chunking for machine consumption, and targeting a page "
            "length. Structure remains worth recommending, but for readers."
        ),
        whyItMatters=(
            "Chunking advice is a staple of GEO content marketing and would push users to restructure working pages "
            "for no stated benefit."
        ),
        appliesWhen=[
            "A user asks whether to split content into smaller chunks for AI",
            "A third-party GEO recommendation proposes restructuring for machine parsing",
            "Discussing page length",
        ],
        doesNotApplyWhen=[
            "Genuinely unreadable pages, where sectioning helps human readers",
            "Non-Google AI systems with different documented retrieval behaviour",
        ],
        entities=["content", "page"],
        relatedIssues=["content chunking proposals", "page length questions"],
        checks=["words", "h2"],
        recommendedAction=(
            "Decline to recommend machine-oriented chunking. Recommend structure only where it helps readers, and "
            "restate that there is no ideal page length."
        ),
        applicability=["geo_analysis", "myth_guard", "content_analysis", "heading_analysis"],
        limitations=(
            "Applies to Google's systems. Other retrieval systems may behave differently, and readability-driven "
            "structure is still endorsed."
        ),
        relatedKnowledge=["geo-google-organize-content-for-readers", "seo-content-no-ideal-word-count", "geo-heuristic-answer-first-structure"],
        tags=["chunking", "content_length", "myth_guard", "geo"],
        location="Section: Mythbusting generative AI search - \"Chunking\" content",
        quote="There's no requirement to break your content into tiny pieces for AI to better understand it. [...] There's no ideal page length, and in the end, make pages for your audience, not just for generative AI search.",
    ),
    it(
        id="geo-google-no-rewriting-for-ai",
        category="machine_readability", topic="geo_tactics", subtopic="rewriting",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Content does not need rewriting in a special style for AI systems",
        principle=(
            "Google states that you do not need to write in a specific way just for generative AI search, because "
            "AI systems can understand synonyms and general meanings of what someone is seeking in order to connect "
            "them with content that might not use the same precise words - so you do not have to worry about "
            "long-tail keywords or capturing every variation of how someone might seek your content."
        ),
        explanation=(
            "This removes the basis for AI-specific rewriting services and for long-tail keyword coverage as a GEO "
            "tactic."
        ),
        whyItMatters=(
            "Rewriting for AI is a commonly sold service. A direct denial lets SEO Maker steer users toward content "
            "substance instead."
        ),
        appliesWhen=[
            "A user asks whether to rewrite content in an AI-friendly style",
            "A recommendation proposes covering every query phrasing",
        ],
        doesNotApplyWhen=[
            "Rewriting for genuine clarity or reader benefit, which remains worthwhile",
            "Non-Google systems",
        ],
        entities=["content", "page"],
        relatedIssues=["AI rewriting proposals", "long-tail keyword coverage"],
        checks=["none"],
        recommendedAction=(
            "Decline AI-specific rewriting recommendations. Redirect the user to substance, first-hand input and "
            "clarity for readers."
        ),
        applicability=["geo_analysis", "myth_guard", "content_analysis"],
        limitations=(
            "Applies to Google's systems. Writing clearly still matters, and the GEO research literature reports "
            "measurable effects from fluency changes on other engines."
        ),
        relatedKnowledge=["seo-content-vocabulary-variation", "geo-research-fluency-and-combination", "geo-google-no-chunking"],
        tags=["rewriting", "long_tail", "myth_guard", "geo"],
        location="Section: Mythbusting generative AI search - Rewriting content just for AI systems",
        quote="You don't need to write in a specific way just for generative AI search. AI systems can understand synonyms and general meanings of what someone is seeking.",
    ),
    it(
        id="geo-google-inauthentic-mentions",
        category="emerging_practices", topic="geo_tactics", subtopic="mentions",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Seeking inauthentic mentions across the web is not as helpful as it seems",
        principle=(
            "Google states that while its generative AI features can show what is being said about products and "
            "services across the web - including blogs, videos and forum discussions - seeking inauthentic mentions "
            "is not as helpful as it might seem, because its core ranking systems focus on high-quality content "
            "while other systems block spam, and its generative AI features depend on both."
        ),
        explanation=(
            "Brand mention seeding is a widely marketed GEO tactic. Google acknowledges that mentions are visible "
            "to its AI features while explicitly discouraging manufactured ones."
        ),
        whyItMatters=(
            "It lets SEO Maker respond accurately to mention-based GEO advice: the mechanism is real, the "
            "manipulation is not recommended."
        ),
        appliesWhen=[
            "A user asks about seeding brand mentions for AI visibility",
            "Evaluating a third-party GEO proposal built on mention volume",
        ],
        doesNotApplyWhen=[
            "Genuine PR, community participation or earned coverage",
        ],
        entities=["business", "site"],
        relatedIssues=["mention seeding proposals", "artificial brand mentions"],
        checks=["none"],
        recommendedAction=(
            "Acknowledge that authentic discussion across the web is visible to AI features, and advise against "
            "manufacturing mentions."
        ),
        applicability=["geo_analysis", "myth_guard", "spam_risk_analysis"],
        limitations=(
            "Google does not define inauthentic or describe how mentions are weighted, so this cannot support any "
            "quantitative recommendation."
        ),
        relatedKnowledge=["geo-google-ai-rooted-in-core-search"],
        tags=["mentions", "brand", "myth_guard", "geo"],
        location="Section: Mythbusting generative AI search - Seeking inauthentic \"mentions\"",
        quote="However, seeking inauthentic \"mentions\" across the web isn't as helpful as it might seem.",
    ),
    it(
        id="geo-google-structured-data-optional",
        category="machine_readability", topic="structured_data_for_ai", subtopic="requirement",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Structured data is not required for generative AI search, but stays worthwhile for rich results",
        principle=(
            "Google states that structured data is not required for generative AI search and that there is no "
            "special schema.org markup that needs to be added, while adding that it is a good idea to continue "
            "using it as part of an overall SEO strategy because it helps with rich result eligibility on Google "
            "Search."
        ),
        explanation=(
            "Both halves must travel together. Structured data keeps its classic justification and loses the "
            "AI-visibility justification that vendors often attach to it."
        ),
        whyItMatters=(
            "Selling schema as the route into AI answers is a common overclaim, and the correction here comes with "
            "a legitimate reason to keep recommending markup."
        ),
        appliesWhen=[
            "A user asks whether schema is needed for AI Overviews or AI Mode",
            "Justifying a structured data recommendation",
        ],
        doesNotApplyWhen=[
            "Rich result eligibility, where required properties genuinely matter",
            "Non-Google AI systems",
        ],
        entities=["page", "structured_data"],
        relatedIssues=["schema for AI claims", "missing structured data"],
        checks=["schema"],
        recommendedAction=(
            "Recommend structured data for rich result eligibility only, and state plainly that it is not required "
            "for Google's generative AI features."
        ),
        applicability=["geo_analysis", "structured_data_analysis", "myth_guard"],
        limitations=(
            "Applies to Google's AI features. Other AI systems have not documented equivalent positions, and "
            "structured data remains required for specific rich result types."
        ),
        relatedKnowledge=["myth-schema-required-for-ai-overviews", "seo-sd-eligibility-not-guarantee", "seo-sd-eligibility-for-features-starter"],
        tags=["structured_data", "schema_org", "myth_guard", "geo"],
        location="Section: Mythbusting generative AI search - Overfocusing on structured data",
        quote="Structured data isn't required for generative AI search, and there's no special schema.org markup you need to add. However, it's a good idea to continue using it as part of your overall SEO strategy, as it helps with being eligible for rich results on Google Search.",
    ),
    it(
        id="geo-google-search-console-ai-report",
        category="citations", topic="measurement", subtopic="search_console",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Search Console has a Generative AI performance report, and no third-party tool sees Google's internals",
        principle=(
            "Google directs site owners to the Generative AI performance report in Search Console to measure how "
            "content performs in generative AI features on Google Search and Discover. It separately warns to be "
            "wary of third-party tools that promise ranking success or claim to use internal Google metrics, "
            "stating that no third-party tool has access to its internal ranking or AI systems."
        ),
        explanation=(
            "There is a first-party measurement surface, and SEO Maker should point to it rather than estimating AI "
            "visibility. The warning also applies to SEO Maker itself, which should not claim internal access."
        ),
        whyItMatters=(
            "It gives users a real measurement route and constrains how SEO Maker may describe its own numbers - "
            "an honesty requirement the product has to meet."
        ),
        appliesWhen=[
            "A user asks how to measure AI visibility",
            "Describing the basis of SEO Maker's own scores or estimates",
            "A third-party report claims to use Google's internal metrics",
        ],
        doesNotApplyWhen=[
            "Non-Google AI assistants, which have their own or no measurement surfaces",
        ],
        entities=["site", "business"],
        relatedIssues=["AI visibility measurement", "third-party metric claims"],
        checks=["none"],
        recommendedAction=(
            "Point users at the Search Console Generative AI performance report for measurement, and describe SEO "
            "Maker's own outputs as derived from its crawl, never from Google's internal systems."
        ),
        applicability=["geo_analysis", "site_audit", "reporting_language", "myth_guard"],
        limitations=(
            "The report covers Google's features only. Report availability and metric definitions may change, and "
            "citations that produce no click may not be fully represented."
        ),
        relatedKnowledge=["geo-openai-referral-attribution", "myth-domain-authority-ranking-factor"],
        tags=["measurement", "search_console", "geo", "third_party_tools"],
        location="Section: Measure visibility in generative AI features with Search Console",
        quote="No third-party tool has access to our internal ranking or AI systems.",
    ),
    it(
        id="geo-google-agentic-experiences",
        category="emerging_practices", topic="agentic_browsing", subtopic="browser_agents",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Browser agents read pages through screenshots, the DOM and the accessibility tree",
        principle=(
            "Google describes AI agents as autonomous systems that perform tasks on behalf of people, notes that "
            "browser agents may access a website to gather data by analysing visual renderings such as screenshots, "
            "inspecting the DOM structure and interpreting the accessibility tree, and points to agent-friendly "
            "website guidance and emerging protocols such as the Universal Commerce Protocol."
        ),
        explanation=(
            "Agent readability depends on rendering, DOM structure and accessibility semantics - which is the one "
            "concrete reason semantic markup and accessibility work carry forward-looking value."
        ),
        whyItMatters=(
            "It connects accessibility findings to an emerging, first-party-described consumption channel, giving "
            "them a second justification beyond compliance."
        ),
        appliesWhen=[
            "A user asks about preparing a site for AI agents",
            "Justifying accessibility or semantic markup work in a forward-looking context",
            "Auditing transactional flows on a commerce site",
        ],
        doesNotApplyWhen=[
            "Presenting agent readiness as affecting current Google Search or AI Overview visibility",
            "Sites with no transactional or data-gathering surface an agent would use",
        ],
        entities=["site", "page", "technical_configuration"],
        relatedIssues=["accessibility tree gaps", "agent readiness"],
        checks=["none"],
        recommendedAction=(
            "Where relevant, note that accessibility and DOM clarity also serve browser agents, and label this as "
            "emerging rather than an established ranking or visibility factor."
        ),
        applicability=["geo_analysis", "technical_audit", "ecommerce_analysis"],
        limitations=(
            "Google frames this as something to explore if relevant and if you have extra time. There is no stated "
            "search or AI-feature benefit, and the protocols named are emerging."
        ),
        relatedKnowledge=["geo-google-semantic-html-not-required"],
        tags=["agents", "accessibility", "emerging", "geo", "ucp"],
        location="Section: Explore agentic experiences",
        quote="browser agents may access your website to gather the data they need to complete these tasks, such as analyzing visual renderings (like screenshots), inspecting the DOM structure, and interpreting the accessibility tree.",
    ),
    it(
        id="geo-google-seo-not-mandatory",
        category="emerging_practices", topic="prioritisation", subtopic="scope",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Google says plenty of content succeeds with no overt SEO at all",
        principle=(
            "Google states that plenty of content thrives in Google Search, including generative AI experiences, "
            "without any overt SEO at all, and that site owners do not need to accomplish everything in its guide "
            "in order to succeed on Google Search."
        ),
        explanation=(
            "A long audit findings list is not a list of obligations. This supports presenting recommendations as "
            "ranked opportunities rather than a compliance checklist."
        ),
        whyItMatters=(
            "It counteracts the natural tendency of an automated audit to imply that every finding must be fixed, "
            "which erodes user trust and buries the findings that matter."
        ),
        appliesWhen=[
            "Presenting a long list of audit findings",
            "A user is overwhelmed by the volume of recommendations",
            "Deciding how forcefully to phrase low-severity items",
        ],
        doesNotApplyWhen=[
            "Genuine blockers such as noindex on important pages or a 5xx robots.txt, which do need fixing",
        ],
        entities=["site", "page"],
        relatedIssues=["audit overload", "low-value recommendations"],
        checks=["none"],
        recommendedAction=(
            "Rank findings and make clear which few matter most, explicitly noting that the rest are optional "
            "improvements rather than requirements."
        ),
        applicability=["prioritisation", "reporting_language", "site_audit", "geo_analysis"],
        limitations=(
            "This is about proportion, not permission to ignore genuine defects. Google still documents the "
            "practices it recommends."
        ),
        relatedKnowledge=["geo-google-indexing-not-guaranteed", "seo-tech-change-latency"],
        tags=["prioritisation", "reporting_language", "expectations"],
        location="Section: Next steps: what to focus on",
        quote="plenty of content thrives in Google Search (including generative AI experiences) without any overt SEO at all, and you don't need to accomplish everything in this guide in order to succeed on Google Search.",
    ),
]
