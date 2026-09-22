# -*- coding: utf-8 -*-
"""Knowledge from 'Creating helpful, reliable, people-first content' (updated 2025-12-10)."""

from common import item, HELPFUL

COMMON = dict(
    domain="seo", category="content", source=HELPFUL,
    evidenceType="official_documentation", evidenceStrength="strong", confidence="high",
    version="Google Search Central, last updated 2025-12-10", reviewBy="2027-03-22",
)


def it(**kw):
    return item(**{**COMMON, **kw})


ITEMS = [
    it(
        id="seo-content-self-assessment-questions",
        topic="content_quality", subtopic="self_assessment",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Google publishes explicit self-assessment questions for content and quality",
        principle=(
            "Google's helpful-content guidance lists content and quality questions creators should ask, including "
            "whether the content provides original information, reporting, research or analysis; whether it gives a "
            "substantial, complete or comprehensive description of the topic; whether it offers insightful analysis "
            "beyond the obvious; whether it adds substantial value rather than copying or rewriting other sources; "
            "whether the main heading or page title gives a descriptive, helpful summary without exaggerating; and "
            "whether it would be worth bookmarking, sharing or seeing referenced in a printed publication."
        ),
        explanation=(
            "These are the concrete questions SEO Maker's AI layer should reason against when it has page content. "
            "They convert a vague thin-content flag into specific, answerable gaps."
        ),
        whyItMatters=(
            "It is the most defensible grounding available for content recommendations, because the questions come "
            "from Google rather than practitioner inference."
        ),
        appliesWhen=[
            "Page content is available and needs a quality judgement",
            "Explaining why a page reads as low value despite passing technical checks",
            "Generating specific content improvement suggestions",
        ],
        doesNotApplyWhen=[
            "Producing a numeric content score - Google publishes no scoring formula",
            "Pages whose purpose is functional or transactional rather than informational",
            "Claiming these questions map onto specific ranking systems",
        ],
        entities=["page", "content"],
        relatedIssues=["thin content", "unoriginal content", "low value content", "derivative content"],
        checks=["words", "title"],
        recommendedAction=(
            "Assess the page against the named questions and report the specific ones it fails, with what is missing "
            "rather than a generic quality verdict."
        ),
        applicability=["content_analysis", "page_audit", "site_audit"],
        limitations=(
            "A self-assessment framework, not a scoring formula. Google does not publish how these questions map to "
            "ranking systems, and answering them well guarantees nothing."
        ),
        relatedKnowledge=["seo-content-people-first-assessment", "seo-content-expertise-questions", "seo-qrg-mc-quality-dimensions"],
        tags=["content_quality", "originality", "self_assessment"],
        location="Section: Self-assess your content - Content and quality questions",
        quote="If the content draws on other sources, does it avoid simply copying or rewriting those sources, and instead provide substantial additional value and originality?",
    ),
    it(
        id="seo-content-expertise-questions",
        topic="eeat", subtopic="expertise_signals",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Google names observable expertise signals: sourcing, author background, and verifiable accuracy",
        principle=(
            "Google's expertise questions ask whether content presents information in a way that makes you want to "
            "trust it - such as clear sourcing, evidence of the expertise involved, and background about the author "
            "or publishing site through links to an author page or About page - whether the site would be seen as "
            "well-trusted or widely recognised as an authority on its topic, whether the content is written or "
            "reviewed by someone who demonstrably knows the topic, and whether it contains easily-verified factual "
            "errors."
        ),
        explanation=(
            "Several of these are partially observable from a crawl: presence of bylines, author pages, an About "
            "page, and outbound citations. That makes them actionable rather than abstract."
        ),
        whyItMatters=(
            "It turns credibility advice into checkable page and site features, which is exactly the kind of "
            "recommendation SEO Maker can make concretely."
        ),
        appliesWhen=[
            "Content pages carry no byline or author information",
            "The site has no About or contact page",
            "Assessing credibility on a YMYL-adjacent topic",
        ],
        doesNotApplyWhen=[
            "Forum or social content where an alias is an acceptable identifier",
            "Presenting these features as ranking factors rather than trust signals",
        ],
        entities=["page", "site", "content"],
        relatedIssues=["missing author information", "no About page", "unsourced claims"],
        checks=["none"],
        recommendedAction=(
            "Recommend bylines that link to author background, a clear About page, and explicit sourcing for "
            "factual claims, scaled to how consequential the topic is."
        ),
        applicability=["content_analysis", "site_audit", "page_audit"],
        limitations=(
            "These are trust signals for readers and raters, not confirmed ranking inputs. Google states separately "
            "that E-E-A-T is not itself a ranking factor."
        ),
        relatedKnowledge=["seo-content-who-how-why", "seo-qrg-who-is-responsible", "myth-eeat-is-a-ranking-factor"],
        tags=["eeat", "authorship", "sourcing", "trust"],
        location="Section: Self-assess your content - Expertise questions",
        quote="Does the content present information in a way that makes you want to trust it, such as clear sourcing, evidence of the expertise involved, background about the author or the site that publishes it[?]",
    ),
    it(
        id="seo-content-search-engine-first-signals",
        topic="content_quality", subtopic="search_engine_first",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Google lists warning signs of search-engine-first content",
        principle=(
            "Google lists warning signs that content is made for search engines rather than people: content made "
            "primarily to attract search visits; producing lots of content across many topics hoping some performs; "
            "using extensive automation across many topics; mainly summarising others without adding value; writing "
            "about trending things you would not otherwise cover; leaving readers needing to search again; writing "
            "to a word count; entering a niche without real expertise for traffic reasons; promising answers to "
            "questions that have no answer; changing page dates to seem fresh without substantial change; and "
            "adding or removing content mainly to seem fresh."
        ),
        explanation=(
            "Several of these are detectable at site level: large volumes of thin pages across unrelated topics, "
            "templated content, and date changes without content changes between crawls."
        ),
        whyItMatters=(
            "It gives SEO Maker an official basis for site-level pattern findings that no single page check would "
            "surface, and names practices the tool must never recommend."
        ),
        appliesWhen=[
            "A site shows a large volume of shallow pages across unrelated topics",
            "Page dates change between crawls without corresponding content changes",
            "A user asks about publishing volume or content refresh strategies",
        ],
        doesNotApplyWhen=[
            "Genuine content updates, which Google encourages",
            "Large sites with real topical depth and a coherent purpose",
        ],
        entities=["site", "content", "page"],
        relatedIssues=["content bloat", "date manipulation", "topic sprawl", "derivative content"],
        checks=["words"],
        recommendedAction=(
            "Where these patterns appear, name the specific one observed and recommend consolidation or genuine "
            "improvement. Never recommend date-stamp refreshes or volume publishing."
        ),
        applicability=["content_analysis", "site_audit", "spam_risk_analysis", "myth_guard"],
        limitations=(
            "These are self-assessment warning signs, not a classifier. A site can exhibit one without being "
            "search-engine-first, and Google publishes no threshold."
        ),
        relatedKnowledge=["seo-content-no-preferred-word-count", "myth-date-refresh-for-freshness", "seo-qrg-scaled-content-abuse"],
        tags=["content_quality", "spam_risk", "freshness", "scaled_content"],
        location="Section: Avoid creating search engine-first content",
        quote="Are you producing lots of content on many different topics in hopes that some of it might perform well in search results?",
    ),
    it(
        id="seo-content-no-preferred-word-count",
        topic="content_length", subtopic="word_count",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google states directly that it has no preferred word count",
        principle=(
            "Among its search-engine-first warning signs, Google asks whether you are writing to a particular word "
            "count because you have heard or read that Google has a preferred word count, and answers "
            "parenthetically: \"No, we don't.\""
        ),
        explanation=(
            "This is a direct first-party denial, stronger than an absence of guidance. Any word-count target in a "
            "recommendation contradicts it."
        ),
        whyItMatters=(
            "SEO Maker applies an internal thin-content word threshold. This item is the guardrail that keeps that "
            "threshold described as an internal heuristic rather than a Google expectation."
        ),
        appliesWhen=[
            "A user asks how many words a page needs",
            "Phrasing a thin-content finding",
            "A competing tool has recommended a word-count target",
        ],
        doesNotApplyWhen=[
            "Pages that genuinely fail to cover their topic, where the problem is coverage rather than count",
        ],
        entities=["content", "page"],
        relatedIssues=["word count targets", "thin content"],
        checks=["words"],
        recommendedAction=(
            "State that Google has no preferred word count, then describe what the page is actually missing in "
            "substance."
        ),
        applicability=["myth_guard", "content_analysis", "reporting_language"],
        limitations=(
            "The denial concerns a preferred count. It does not mean length is never a symptom of a page that fails "
            "to answer its query."
        ),
        relatedKnowledge=["seo-content-no-word-count-target-starter", "myth-more-words-rank-better", "seo-content-no-ideal-word-count"],
        tags=["word_count", "content_length", "myth_guard"],
        location="Section: Avoid creating search engine-first content",
        quote="Are you writing to a particular word count because you've heard or read that Google has a preferred word count? (No, we don't.)",
    ),
    it(
        id="myth-date-refresh-for-freshness",
        topic="freshness", subtopic="date_manipulation",
        knowledgeType="myth", claimType="myth",
        title="Myth: changing dates or churning content makes a site look fresh to Google",
        principle=(
            "Claim: updating page dates, or adding and removing content in volume, signals freshness and helps "
            "rankings. Reality: Google lists changing the date of pages to make them seem fresh when the content has "
            "not substantially changed as a search-engine-first warning sign, and answers the question about adding "
            "or removing content to seem fresh with \"No, it won't.\""
        ),
        explanation=(
            "Freshness recommendations must be tied to genuine content change. A date-only update is explicitly "
            "named as a warning sign."
        ),
        whyItMatters=(
            "Automated date-bumping is a widespread tactic and is easy for SEO Maker to detect across two crawls, "
            "making this both a myth guard and a real finding."
        ),
        appliesWhen=[
            "Published or modified dates change between crawls with no substantive content change",
            "A user asks whether to re-date old posts",
        ],
        doesNotApplyWhen=[
            "Genuine updates, where showing an accurate updated date is correct and useful",
            "Query types that genuinely demand current information, where real freshness matters",
        ],
        entities=["page", "content", "site"],
        relatedIssues=["date manipulation", "cosmetic content refresh"],
        checks=["none"],
        recommendedAction=(
            "Recommend updating content substantively and reflecting that honestly in the date. Explicitly advise "
            "against date-only changes."
        ),
        applicability=["myth_guard", "content_analysis", "freshness_analysis", "site_audit"],
        limitations=(
            "Freshness genuinely matters for some query types, and accurate update dates are useful to readers. The "
            "myth is that the date itself is the lever."
        ),
        relatedKnowledge=["seo-qrg-freshness-query-types", "seo-content-search-engine-first-signals"],
        tags=["freshness", "dates", "myth_guard"],
        location="Section: Avoid creating search engine-first content",
        quote="Are you adding a lot of new content or removing a lot of older content primarily because you believe it will help your search rankings overall by somehow making your site seem \"fresh?\" (No, it won't)",
    ),
    it(
        id="seo-content-eeat-trust-central",
        topic="eeat", subtopic="trust",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Trust is the most important part of E-E-A-T, and not all four are needed",
        principle=(
            "Google states that of the E-E-A-T aspects, trust is most important; the others contribute to trust, and "
            "content does not necessarily have to demonstrate all of them - some content may be helpful because of "
            "the experience it demonstrates, other content because of the expertise it shares."
        ),
        explanation=(
            "This prevents a checklist reading of E-E-A-T. A first-hand experience page does not need formal "
            "credentials to be strong, and a credentialed page that is untrustworthy is not saved by its expertise."
        ),
        whyItMatters=(
            "It stops SEO Maker recommending credentials for content whose value is experiential, which is a common "
            "and unhelpful piece of automated advice."
        ),
        appliesWhen=[
            "Explaining content credibility for a page",
            "Deciding whether to recommend expert authorship or first-hand detail",
        ],
        doesNotApplyWhen=[
            "Treating E-E-A-T as a score or ranking factor",
            "Clear YMYL topics where Google indicates some information genuinely requires expertise",
        ],
        entities=["content", "page", "site"],
        relatedIssues=["credibility gaps", "missing expertise signals"],
        checks=["none"],
        recommendedAction=(
            "Identify which of experience or expertise the page's purpose actually calls for, and recommend "
            "strengthening that one rather than all four."
        ),
        applicability=["content_analysis", "page_audit", "reporting_language"],
        limitations=(
            "E-E-A-T is a rater and self-assessment concept. Google states it is not itself a ranking factor and "
            "there is no E-E-A-T score in its systems."
        ),
        relatedKnowledge=["seo-content-eeat-framework", "myth-eeat-is-a-ranking-factor", "seo-qrg-ymyl-experience-or-expertise"],
        tags=["eeat", "trust", "content_quality"],
        location="Section: Get to know E-E-A-T and the quality rater guidelines",
        quote="Of these aspects, trust is most important. The others contribute to trust, but content doesn't necessarily have to demonstrate all of them.",
    ),
    it(
        id="seo-content-ymyl-extra-weight",
        topic="ymyl", subtopic="ranking_weight",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google gives more weight to strong E-E-A-T signals on YMYL topics",
        principle=(
            "Google states that its systems give even more weight to content that aligns with strong E-E-A-T for "
            "topics that could significantly impact the health, financial stability or safety of people, or the "
            "welfare or well-being of society - the topics it calls Your Money or Your Life."
        ),
        explanation=(
            "Business and topic context changes severity. The same thin, unsourced page is a materially more "
            "serious finding on a medical, financial or safety site than on a hobby blog."
        ),
        whyItMatters=(
            "It gives SEO Maker a source-backed basis for scaling issue severity by the site's subject matter rather "
            "than treating every site identically."
        ),
        appliesWhen=[
            "The site or page covers health, finance, safety, or civic topics",
            "Prioritising content-credibility findings across a site",
        ],
        doesNotApplyWhen=[
            "Clearly non-YMYL topics, where Google indicates high accuracy and trust are not required to prevent harm",
            "Implying a YMYL classification produces a penalty - it raises the standard, not a sanction",
        ],
        entities=["site", "content", "business"],
        relatedIssues=["low credibility on a YMYL topic", "unsourced health or financial claims"],
        checks=["none"],
        recommendedAction=(
            "Raise the severity of credibility, sourcing and accuracy findings when the site's topic is YMYL, and "
            "say why the standard is higher."
        ),
        applicability=["content_analysis", "site_audit", "prioritisation"],
        limitations=(
            "YMYL is a spectrum judged by potential harm, not a fixed list of industries, and Google does not "
            "publish how the extra weight is applied."
        ),
        relatedKnowledge=["seo-content-ymyl", "seo-qrg-ymyl-categories", "seo-qrg-ymyl-diagnostic-questions"],
        tags=["ymyl", "eeat", "prioritisation", "severity"],
        location="Section: Get to know E-E-A-T and the quality rater guidelines",
        quote="our systems give even more weight to content that aligns with strong E-E-A-T for topics that could significantly impact the health, financial stability, or safety of people, or the welfare or well-being of society.",
    ),
    it(
        id="seo-content-raters-do-not-rank",
        topic="quality_raters", subtopic="influence",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Rater data is not used directly in ranking algorithms",
        principle=(
            "Google states that search raters have no control over how pages rank and that rater data is not used "
            "directly in its ranking algorithms; the analogy given is a restaurant collecting feedback cards from "
            "diners, used to know whether the systems seem to be working."
        ),
        explanation=(
            "The rater guidelines are a legitimate source of vocabulary and evaluation criteria, but nothing in "
            "them is a ranking factor. SEO Maker should cite them as a quality rubric, never as algorithm behaviour."
        ),
        whyItMatters=(
            "Much SEO advice cites the rater guidelines as though they described the algorithm. This distinction is "
            "what keeps SEO Maker's use of them honest."
        ),
        appliesWhen=[
            "Citing rater guidelines concepts such as Page Quality, Needs Met, or E-E-A-T",
            "A user asks whether raters can affect their site",
        ],
        doesNotApplyWhen=[
            "Dismissing the guidelines - Google says reading them helps creators self-assess and align conceptually "
            "with the signals its systems use",
        ],
        entities=["site", "page", "content"],
        relatedIssues=["rater guideline misattribution"],
        checks=["none"],
        recommendedAction=(
            "When using rater-guideline concepts, label them as evaluation criteria that describe quality "
            "conceptually, not as ranking mechanics."
        ),
        applicability=["reporting_language", "content_analysis", "myth_guard"],
        limitations=(
            "Google does say the guidelines help align content conceptually with the signals its automated systems "
            "use, so they are not irrelevant to ranking - only not directly used."
        ),
        relatedKnowledge=["seo-qrg-ratings-aggregate-only", "seo-content-eeat-framework"],
        tags=["quality_raters", "eeat", "reporting_language"],
        location="Section: Get to know E-E-A-T and the quality rater guidelines",
        quote="Search raters have no control over how pages rank. Rater data is not used directly in our ranking algorithms.",
    ),
    it(
        id="seo-content-who-how-why",
        topic="content_quality", subtopic="who_how_why",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Google's Who, How and Why framework, with Why the most important",
        principle=(
            "Google asks creators to evaluate content by Who created it, How it was created, and Why it was created. "
            "It strongly encourages accurate authorship information such as bylines where readers would expect them, "
            "suggests explaining production methods where relevant, and states that Why is perhaps the most "
            "important question: the reason should be to help people, not primarily to attract search visits."
        ),
        explanation=(
            "Who is partly observable from a crawl through bylines and author pages. How and Why are judgements the "
            "AI layer can make from content. The framework gives a consistent structure for explaining content "
            "recommendations."
        ),
        whyItMatters=(
            "It is a compact, official structure for organising content feedback, and it ties credibility "
            "recommendations to something more concrete than 'improve quality'."
        ),
        appliesWhen=[
            "Structuring content feedback for a page or site",
            "Content lacks author attribution where readers would expect it",
            "Assessing whether content exists for readers or for search",
        ],
        doesNotApplyWhen=[
            "Pages where a byline would not be expected, such as product or category pages",
            "Forum or social content where an alias suffices",
        ],
        entities=["page", "content", "site"],
        relatedIssues=["missing byline", "unclear content purpose", "no author background"],
        checks=["none"],
        recommendedAction=(
            "Where bylines would be expected, recommend adding them with links to author background. Frame content "
            "recommendations around who made it, how, and why."
        ),
        applicability=["content_analysis", "page_audit", "site_audit"],
        limitations=(
            "A self-assessment structure, not a ranking mechanism. Google gives no rule for when a byline is "
            "expected beyond reader expectation."
        ),
        relatedKnowledge=["seo-content-expertise-questions", "seo-content-ai-disclosure", "seo-qrg-who-is-responsible"],
        tags=["authorship", "bylines", "content_quality", "transparency"],
        location="Section: Ask \"Who, How, and Why\" about your content",
        quote="We strongly encourage adding accurate authorship information, such as bylines to content where readers might expect it.",
    ),
    it(
        id="seo-content-ai-disclosure",
        topic="ai_generated_content", subtopic="disclosure",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Disclose AI or automation where a reader would reasonably wonder how content was made",
        principle=(
            "Google states that a How component may include automated, AI-generated and AI-assisted content, asks "
            "whether the use of automation is self-evident to visitors through disclosures, and says AI or "
            "automation disclosures are useful for content where someone might think \"How was this created?\", to be "
            "added when it would be reasonably expected."
        ),
        explanation=(
            "This is a conditional recommendation, not a blanket disclosure requirement. The trigger is reader "
            "expectation, which depends on the content type."
        ),
        whyItMatters=(
            "SEO Maker generates content suggestions itself, so it needs an accurate position on AI disclosure - "
            "neither alarmist nor silent."
        ),
        appliesWhen=[
            "Content was substantially generated or assisted by automation",
            "A user asks whether they must disclose AI use",
        ],
        doesNotApplyWhen=[
            "Ordinary tool-assisted writing where readers would not wonder about production method",
            "Claiming disclosure is required for indexing or ranking - Google frames it as useful, not mandatory",
        ],
        entities=["content", "page"],
        relatedIssues=["undisclosed AI content", "content provenance"],
        checks=["none"],
        recommendedAction=(
            "Recommend disclosure where readers would reasonably ask how the content was made, and explain that it "
            "is a reader-trust measure rather than a ranking requirement."
        ),
        applicability=["content_analysis", "reporting_language"],
        limitations=(
            "Google says to consider adding disclosures when reasonably expected; it does not define when that is, "
            "or state any search consequence for omitting them."
        ),
        relatedKnowledge=["seo-content-ai-generated-content-stance", "myth-ai-content-cannot-rank", "seo-qrg-genai-tools-neutral"],
        tags=["ai_content", "disclosure", "transparency"],
        location="Section: How (the content was created)",
        quote="Overall, AI or automation disclosures are useful for content where someone might think \"How was this created?\" Consider adding these when it would be reasonably expected.",
    ),
    it(
        id="seo-content-automation-for-rankings-is-spam",
        topic="ai_generated_content", subtopic="spam_boundary",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="The spam line is purpose, not production method",
        principle=(
            "Google states that if you use automation, including AI generation, to produce content for the primary "
            "purpose of manipulating search rankings, that is a violation of its spam policies on scaled content "
            "abuse."
        ),
        explanation=(
            "The trigger is the primary purpose of the content, not the tooling. This is the precise boundary SEO "
            "Maker should use whenever AI-assisted content comes up."
        ),
        whyItMatters=(
            "SEO Maker produces content recommendations with AI. Stating the boundary accurately protects users "
            "from both over-caution and genuine spam risk."
        ),
        appliesWhen=[
            "A user asks about publishing AI-assisted content",
            "A site shows large volumes of automated content across many topics",
        ],
        doesNotApplyWhen=[
            "AI-assisted content produced to genuinely help an audience, which Google does not treat as a violation",
        ],
        entities=["content", "site"],
        relatedIssues=["scaled content abuse", "mass-generated content"],
        checks=["none"],
        recommendedAction=(
            "Frame the question as purpose and added value. Recommend human review and genuine original "
            "contribution rather than avoiding automation."
        ),
        applicability=["content_analysis", "spam_risk_analysis", "myth_guard"],
        limitations=(
            "Google does not publish a volume threshold or a way to determine primary purpose from the outside, so "
            "this supports reasoning rather than classification."
        ),
        relatedKnowledge=["seo-content-ai-generated-content-stance", "seo-qrg-scaled-content-abuse", "seo-qrg-genai-tools-neutral"],
        tags=["ai_content", "spam_policy", "scaled_content"],
        location="Section: Why (was the content created)",
        quote="If you use automation, including AI-generation, to produce content for the primary purpose of manipulating search rankings, that's a violation of our spam policies.",
    ),
    it(
        id="seo-content-page-experience-holistic",
        topic="page_experience", subtopic="scope",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Page experience is assessed across many aspects, not one or two metrics",
        principle=(
            "Google states that its core ranking systems look to reward content that provides a good page "
            "experience, and that site owners should not focus on only one or two aspects of page experience but "
            "check whether they provide an overall great page experience across many aspects."
        ),
        explanation=(
            "This is the correct framing for performance findings. A Core Web Vitals number is one input to page "
            "experience, not the whole of it, and chasing a single metric is explicitly discouraged."
        ),
        whyItMatters=(
            "It stops performance recommendations being presented as the dominant lever and keeps them proportionate "
            "to content and technical findings."
        ),
        appliesWhen=[
            "Reporting performance or Core Web Vitals findings",
            "A user asks whether improving one metric will improve rankings",
        ],
        doesNotApplyWhen=[
            "Diagnosing a specific metric regression, where narrow focus is appropriate for the diagnosis itself",
        ],
        entities=["page", "site"],
        relatedIssues=["single-metric optimisation", "Core Web Vitals fixation"],
        checks=["none"],
        recommendedAction=(
            "Present performance findings as one component of page experience, alongside mobile rendering, "
            "intrusive interstitials and main-content clarity."
        ),
        applicability=["performance_analysis", "page_audit", "prioritisation", "reporting_language"],
        limitations=(
            "Google does not enumerate every aspect of page experience or publish weights, so this guides framing "
            "rather than scoring."
        ),
        relatedKnowledge=["seo-perf-core-web-vitals-set", "geo-google-page-experience"],
        tags=["page_experience", "performance", "prioritisation"],
        location="Section: Provide a great page experience",
        quote="Site owners seeking to be successful with our systems should not focus on only one or two aspects of page experience. Instead, check if you're providing an overall great page experience across many aspects.",
    ),
]
