# -*- coding: utf-8 -*-
"""Knowledge from Google's Search Quality Rater General Guidelines (2025-09-11)
and the public 'An Overview' summary (November 2023).

IMPORTANT SCOPE NOTE carried on every item here: these are criteria human raters
apply. Google states that rater data is not used directly in ranking algorithms.
Items are therefore claimType='evaluation_criterion', never 'ranking factor'.
"""

from common import item, QRG, QRG_OVERVIEW

COMMON = dict(
    domain="seo", source=QRG,
    evidenceType="official_documentation", evidenceStrength="strong", confidence="high",
    version="General Guidelines, September 11 2025", reviewBy="2026-09-22",
)


def it(**kw):
    return item(**{**COMMON, **kw})


ITEMS = [
    # ---------- page quality framework ----------
    it(
        id="seo-qrg-pq-three-steps",
        category="content", topic="page_quality", subtopic="rating_process",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Page Quality is judged in three steps: purpose, harm, then how well it achieves that purpose",
        principle=(
            "Google's rater guidelines set out three steps: assess the true purpose of the page, and rate it Lowest "
            "if the purpose is harmful or designed to deceive people about its true purpose; assess the potential to "
            "cause harm, rating Lowest anything harmful, untrustworthy or spammy; otherwise rate based on how well "
            "the page achieves its purpose. Google describes steps 1 and 2 as a screening process applied before "
            "other quality considerations."
        ),
        explanation=(
            "Purpose comes first. SEO Maker cannot assess a page's content usefully without first establishing what "
            "the page is for, which its page-type classification already begins to do."
        ),
        whyItMatters=(
            "It gives content analysis a defensible order of operations and prevents a product or login page being "
            "judged by article standards."
        ),
        appliesWhen=[
            "Assessing whether a page's content is adequate",
            "Comparing pages of different types within one site",
        ],
        doesNotApplyWhen=[
            "Treating this as a ranking algorithm - it is a human evaluation rubric",
            "Purely technical findings, which do not depend on page purpose",
        ],
        entities=["page", "content"],
        relatedIssues=["page purpose unclear", "content judged against the wrong standard"],
        checks=["words", "title"],
        recommendedAction=(
            "Establish the page's purpose before judging its content, and state that purpose in the finding so the "
            "user can see the standard being applied."
        ),
        applicability=["content_analysis", "page_audit", "reporting_language"],
        limitations=(
            "Rater criteria, not ranking mechanics. Google states rater data is not used directly in ranking "
            "algorithms and no single rating affects how a page ranks."
        ),
        relatedKnowledge=["seo-qrg-page-type-not-quality", "seo-content-raters-do-not-rank", "seo-qrg-mc-quality-dimensions"],
        tags=["page_quality", "purpose", "evaluation"],
        location="Section 3.0 Overall Page Quality Rating, page 22",
        quote="Steps 1 and 2 are a screening process to quickly detect harmful content before other PQ considerations are applied.",
    ),
    it(
        id="seo-qrg-page-type-not-quality",
        category="content", topic="page_quality", subtopic="page_type",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Page type does not determine quality",
        principle=(
            "Google states that as long as a page is created to help people, no particular page purpose or type is "
            "considered higher quality than another - encyclopedia pages are not necessarily higher quality than "
            "humor pages - and that there are highest and lowest quality pages of every type, including shopping, "
            "news, forum, video, error, PDF, image, gossip, humor and home pages."
        ),
        explanation=(
            "SEO Maker should not apply article-style content expectations to functional pages. A currency "
            "converter, a login page or a category page can be excellent while containing very little text."
        ),
        whyItMatters=(
            "Word-count and content-depth checks misfire badly on functional pages. This is the principle that "
            "tells the AI layer to suppress or reframe those findings."
        ),
        appliesWhen=[
            "A low-text page is functional rather than informational",
            "Reporting thin-content findings on product, category, login or tool pages",
        ],
        doesNotApplyWhen=[
            "Informational pages, where content depth genuinely matters for the purpose",
        ],
        entities=["page", "content"],
        relatedIssues=["thin content false positive", "functional page judged as thin"],
        checks=["words", "h1", "meta"],
        recommendedAction=(
            "Use the page-type classification to decide whether a content-depth finding applies at all, and "
            "suppress or reframe it for functional pages."
        ),
        applicability=["content_analysis", "page_audit", "prioritisation"],
        limitations=(
            "Rater criteria. Determining the true purpose of a page still requires judgement that an automated "
            "classifier may get wrong."
        ),
        relatedKnowledge=["seo-qrg-pq-three-steps", "seo-content-no-word-count-target-starter"],
        tags=["page_quality", "page_type", "thin_content", "false_positives"],
        location="Section 2.2 Understanding the Purpose of a Webpage, page 10",
        quote="The type of page does not determine the PQ rating--you have to understand the purpose of the page to determine the rating.",
    ),
    it(
        id="seo-qrg-mc-sc-ads-taxonomy",
        category="content", topic="page_structure", subtopic="mc_sc_ads",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Page content divides into Main Content, Supplementary Content and Ads",
        principle=(
            "Google's guidelines classify all content on a page as Main Content - any part that directly helps the "
            "page achieve its purpose - Supplementary Content, which contributes to a good experience without "
            "directly achieving the purpose, such as navigation links, or Advertisements and monetization. Google "
            "states that the quality of the MC plays a very large role in the Page Quality rating."
        ),
        explanation=(
            "This gives SEO Maker a vocabulary for distinguishing the content that matters from boilerplate. Word "
            "counts and content judgements should target the main content, not the whole DOM."
        ),
        whyItMatters=(
            "Template-heavy pages inflate text metrics with navigation and footers. Separating MC from SC is what "
            "makes a thin-content judgement meaningful."
        ),
        appliesWhen=[
            "Measuring or judging the substantive content of a page",
            "A page's text volume comes largely from navigation, footers or sidebars",
        ],
        doesNotApplyWhen=[
            "Technical checks that legitimately consider the whole document",
        ],
        entities=["page", "content"],
        relatedIssues=["boilerplate inflating word count", "main content hard to identify"],
        checks=["words"],
        recommendedAction=(
            "Base content-quality judgements on the main content, and report navigation or footer text separately "
            "rather than counting it toward the page's substance."
        ),
        applicability=["content_analysis", "page_audit"],
        limitations=(
            "Google notes that user reviews and comments may be MC on some pages and SC on others, so the boundary "
            "requires judgement about the page's purpose."
        ),
        relatedKnowledge=["seo-qrg-filler-placement", "seo-qrg-ads-presence-neutral", "seo-qrg-mc-quality-dimensions"],
        tags=["main_content", "page_structure", "boilerplate"],
        location="Section 2.4 Understanding Webpage Content, pages 13-14",
        quote="Main Content is any part of the page that directly helps the page achieve its purpose. [...] The quality of the MC plays a very large role in the Page Quality rating of a webpage.",
    ),
    it(
        id="seo-qrg-title-part-of-mc",
        category="on_page", topic="title_tag", subtopic="quality_signal",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="The page title is part of the main content, and misleading titles are evidence of low quality",
        principle=(
            "Google's guidelines state that the title at the top of the page is part of the MC, that descriptive MC "
            "titles allow people to make informed decisions about what pages to visit and helpful titles summarise "
            "the MC. A page title that is slightly misleading, shocking or exaggerated is listed as justification "
            "for a Low quality rating, because of the poor experience when users see the actual content after "
            "arriving."
        ),
        explanation=(
            "Title quality has a second, independent justification beyond the title link: mismatch between title and "
            "content is itself a quality defect. Google's examples include speculative sequel announcements and "
            "sensationalised headlines."
        ),
        whyItMatters=(
            "It lets SEO Maker evaluate titles on accuracy against page content - a judgement the AI layer can "
            "make - rather than on length, which the deterministic layer cannot justify."
        ),
        appliesWhen=[
            "A title overstates, sensationalises, or does not match the page's content",
            "Generating or reviewing a title against the page body",
            "A page uses clickbait phrasing",
        ],
        doesNotApplyWhen=[
            "Title length, which neither this nor Google's title-link documentation addresses",
            "Legitimately dramatic subject matter accurately described",
        ],
        entities=["page", "content"],
        relatedIssues=["clickbait title", "title does not match content", "exaggerated title"],
        checks=["title"],
        recommendedAction=(
            "Compare the title against the page's actual main content and flag exaggeration or mismatch as a "
            "quality problem, explaining the reader-experience reason."
        ),
        applicability=["title_generation", "page_audit", "content_analysis"],
        limitations=(
            "Rater criteria rather than algorithmic behaviour. Judging exaggeration needs the page content and some "
            "topic understanding."
        ),
        relatedKnowledge=["seo-onpage-title-quality-criteria", "seo-onpage-title-link-sources", "myth-title-character-limit"],
        tags=["title", "clickbait", "main_content", "page_quality"],
        location="Section 5.2 Low Quality Main Content, page 60; Section 3.1 PQ Rating Considerations, page 20",
        quote="Exaggerated or shocking titles are evidence of Low quality because of the poor user experience that results when users see the actual MC after reaching the page.",
    ),
    it(
        id="seo-qrg-mc-quality-dimensions",
        category="content", topic="content_quality", subtopic="effort_originality_skill",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Main content quality is judged on effort, originality, talent or skill, and accuracy",
        principle=(
            "Google states that for most pages the quality of the MC can be determined by the amount of effort, "
            "originality, and talent or skill that went into creating it, and that for informational and YMYL pages "
            "accuracy and consistency with well-established expert consensus also matter. Effort includes building "
            "page functionality, and on forum or social pages the level of participation and depth of conversation "
            "counts as effort."
        ),
        explanation=(
            "These four dimensions are a far more precise content rubric than a generic quality judgement, and they "
            "tell SEO Maker what to name when a page falls short."
        ),
        whyItMatters=(
            "It converts 'this content is weak' into a specific diagnosis - no original input, no evident effort, "
            "inaccurate, or poorly executed - which produces a far more actionable recommendation."
        ),
        appliesWhen=[
            "Judging whether page content is adequate for its purpose",
            "Explaining why a page reads as low value despite adequate length",
            "Generating specific content improvement recommendations",
        ],
        doesNotApplyWhen=[
            "Producing a score - these are qualitative dimensions with no published weighting",
            "Applying a single standard across page types: Google says expected effort differs by purpose",
        ],
        entities=["page", "content"],
        relatedIssues=["low effort content", "unoriginal content", "inaccurate content", "poorly executed content"],
        checks=["words"],
        recommendedAction=(
            "Diagnose weak content against effort, originality, skill and accuracy, and name the specific dimension "
            "that is lacking."
        ),
        applicability=["content_analysis", "page_audit"],
        limitations=(
            "Rater criteria with no published measurement. Google explicitly says expectations differ by page type, "
            "and that talent or skill should be judged leniently for ordinary people sharing content."
        ),
        relatedKnowledge=["seo-content-self-assessment-questions", "seo-qrg-copied-paraphrased-content", "seo-qrg-typical-is-medium"],
        tags=["content_quality", "effort", "originality", "accuracy"],
        location="Section 3.2 Quality of the Main Content, page 21",
        quote="For most pages, the quality of the MC can be determined by the amount of effort, originality, and talent or skill that went into the creation of the content.",
    ),
    it(
        id="seo-qrg-typical-is-medium",
        category="content", topic="content_quality", subtopic="calibration",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Typical and average pages on a topic are Medium quality, not High",
        principle=(
            "Google instructs raters to have high standards and to calibrate by finding other pages on the same "
            "topic, stating that typical and average pages on a topic generally have Medium, not High, quality main "
            "content. It also notes that Medium quality pages are commonly found online."
        ),
        explanation=(
            "Competitive calibration is built into the rubric. A page that merely matches what everyone else "
            "publishes is average by definition, which is exactly the commodity-content problem Google's generative "
            "AI guidance describes."
        ),
        whyItMatters=(
            "It gives SEO Maker a principled reason to recommend differentiation rather than parity, and sets a "
            "realistic bar so that most pages are not reported as failures."
        ),
        appliesWhen=[
            "A page covers a topic adequately but adds nothing beyond competing pages",
            "Setting expectations about what a content recommendation can achieve",
        ],
        doesNotApplyWhen=[
            "Implying Medium quality is a defect - Google describes it as common and acceptable",
            "Pages whose purpose is served perfectly well by standard treatment",
        ],
        entities=["page", "content"],
        relatedIssues=["undifferentiated content", "commodity content"],
        checks=["words"],
        recommendedAction=(
            "Where a page matches rather than exceeds what competitors publish, recommend a specific "
            "differentiator, and be clear that adequate is not the same as a defect."
        ),
        applicability=["content_analysis", "page_audit", "prioritisation"],
        limitations=(
            "Rater calibration guidance, not a ranking threshold. Google states a page can still be High quality "
            "without reputation information, and that Medium is common."
        ),
        relatedKnowledge=["geo-google-non-commodity-content", "seo-qrg-mc-quality-dimensions"],
        tags=["content_quality", "calibration", "differentiation"],
        location="Section 7.1 High Quality Main Content, page 72; Section 3.0, page 22",
        quote="\"typical\" and \"average\" pages on a topic generally have Medium (not High) quality MC.",
    ),
    it(
        id="seo-qrg-filler-placement",
        category="content", topic="content_structure", subtopic="filler",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="The most helpful main content should be near the top; prominent filler is a quality defect",
        principle=(
            "Google states that site owners should place the most helpful and essential MC near the top of the page "
            "so visitors can immediately access it, and that a high quality page has the most helpful MC placed most "
            "prominently. Filler - low-effort content that adds little value and does not directly support the "
            "purpose - can artificially inflate content and creates a poor experience, especially when placed "
            "prominently ahead of helpful content. A Low rating applies where there is a large amount of unhelpful "
            "filler, or visually prominent filler that makes the helpful MC hard to find."
        ),
        explanation=(
            "This is the guideline behind the familiar complaint about recipe pages: the recipe belongs near the "
            "top. Content placement, not just content presence, is assessed."
        ),
        whyItMatters=(
            "It gives SEO Maker a source-backed way to address pages that pass a word-count check precisely because "
            "they are padded - the opposite failure from thin content."
        ),
        appliesWhen=[
            "A page buries its main content beneath long preambles or background",
            "A page has high word count but low substance",
            "Recommending content structure for a page that already has enough text",
        ],
        doesNotApplyWhen=[
            "Supporting content placed appropriately lower on the page, which Google says can still be valuable",
            "Content types where a build-up is genuinely part of the purpose, such as narrative writing",
        ],
        entities=["page", "content"],
        relatedIssues=["buried main content", "padded content", "excessive preamble"],
        checks=["words"],
        recommendedAction=(
            "Recommend moving the page's core answer or content to the top and demoting supporting material, "
            "rather than adding more content."
        ),
        applicability=["content_analysis", "page_audit", "heading_analysis", "geo_analysis"],
        limitations=(
            "Rater criteria. Google distinguishes valuable supporting content placed appropriately from filler, "
            "which requires judgement about the page's purpose."
        ),
        relatedKnowledge=["seo-qrg-mc-sc-ads-taxonomy", "geo-heuristic-answer-first-structure", "geo-google-page-experience"],
        tags=["filler", "content_placement", "main_content", "page_quality"],
        location="Section 5.2.2 Filler as a Poor User Experience, page 61",
        quote="Web site owners and content creators should place the most helpful and essential MC near the top of the page so that visitors can immediately access it.",
    ),
    it(
        id="seo-qrg-ads-presence-neutral",
        category="content", topic="advertising", subtopic="ads_and_quality",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Having ads is not a quality problem; ads that obstruct the main content are",
        principle=(
            "Google states that the presence or absence of Ads is not by itself a reason for a High or Low quality "
            "rating, because without advertising and monetization some webpages could not exist. However, pages with "
            "Ads, SC or other features that significantly distract from or make it difficult to access the MC should "
            "typically be given a Low rating even if some of the MC is helpful. Google names difficult-to-close ads "
            "that follow page scrolls and interstitials requiring an app download as genuinely distracting, while a "
            "single pop-over with a clear close button is not."
        ),
        explanation=(
            "The distinction is obstruction, not monetization. SEO Maker should never report ad presence or density "
            "as a quality problem in itself."
        ),
        whyItMatters=(
            "Ad-density findings are easy to generate and easy to get wrong, and getting this wrong tells "
            "publishers their business model is a defect."
        ),
        appliesWhen=[
            "A page has intrusive interstitials or sticky ads over the main content",
            "Reporting anything about a page's advertising",
        ],
        doesNotApplyWhen=[
            "Ads that are visible but do not obstruct the main content",
            "Counting ads as a quality metric",
        ],
        entities=["page", "content"],
        relatedIssues=["intrusive interstitials", "ads obscuring content", "sticky overlays"],
        checks=["none"],
        recommendedAction=(
            "Report advertising only where it obstructs access to the main content, and describe the obstruction "
            "rather than the ad count."
        ),
        applicability=["content_analysis", "page_audit", "performance_analysis"],
        limitations=(
            "Rater criteria. Obstruction is a rendered-layout judgement that a crawl may not capture, and Google "
            "also holds sites responsible for the overall quality of the ads they display."
        ),
        relatedKnowledge=["seo-qrg-mc-sc-ads-taxonomy", "geo-google-page-experience"],
        tags=["ads", "interstitials", "page_quality", "monetization"],
        location="Section 2.4.3, page 15; Section 5.3 Distracting Ads/SC, page 62",
        quote="The presence or absence of Ads is not by itself a reason for a High or Low quality rating.",
    ),

    # ---------- website / trust ----------
    it(
        id="seo-qrg-who-is-responsible",
        category="content", topic="site_transparency", subtopic="responsibility",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="It should be clear who runs the site and who created the page's content",
        principle=(
            "Google states that for every page it should be clear who is responsible for the website and who created "
            "the content, noting that on forums and social platforms an alias or username is an acceptable way to "
            "identify the creator. An unsatisfying amount of information about the website or content creator for "
            "the page's purpose is listed as justification for a Low rating, and inadequate information for the "
            "purpose can contribute to a Lowest rating."
        ),
        explanation=(
            "Presence of About, contact and author information is partly observable from a crawl, and the standard "
            "scales with the page's purpose - a store handling payments is held to more than a hobby blog."
        ),
        whyItMatters=(
            "It is one of the few content-credibility criteria SEO Maker can partly verify structurally, and it "
            "matters most on exactly the sites where the stakes are highest."
        ),
        appliesWhen=[
            "A site has no About, contact or author information",
            "An ecommerce site lacks customer service information",
            "Assessing credibility on a YMYL-adjacent site",
        ],
        doesNotApplyWhen=[
            "Forum or social pages where an alias is sufficient",
            "Applying a uniform standard regardless of the page's purpose",
        ],
        entities=["site", "page", "business"],
        relatedIssues=["no About page", "missing contact information", "no author attribution"],
        checks=["none"],
        recommendedAction=(
            "Recommend clear ownership, contact and authorship information scaled to the site's purpose, and treat "
            "missing customer service information on transactional sites as higher severity."
        ),
        applicability=["content_analysis", "site_audit", "page_audit"],
        limitations=(
            "Rater criteria. Google notes that different locales and platforms have their own conventions for what "
            "information should be available."
        ),
        relatedKnowledge=["seo-content-who-how-why", "seo-content-expertise-questions", "seo-qrg-independent-sources-win"],
        tags=["transparency", "about_page", "authorship", "trust"],
        location="Section 2.5.2, page 19; Section 5.5, page 63",
        quote="Every page belongs to a website, and it should be clear: Who [...] is responsible for the website. Who [...] created the content on the page you are evaluating.",
    ),
    it(
        id="seo-qrg-independent-sources-win",
        category="content", topic="reputation", subtopic="independent_sources",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Where a site's self-description conflicts with independent sources, trust the independent sources",
        principle=(
            "Google instructs raters to look for reputation information from outside, independent sources, and "
            "states that when there is disagreement between what the website or content creators say about "
            "themselves and what reputable independent sources say, the independent sources should be trusted. "
            "Reputation research should be performed according to the topic of the page."
        ),
        explanation=(
            "On-site claims of authority carry little weight on their own. This also means reputation is "
            "topic-specific: a site trusted for one subject is not automatically trusted for another."
        ),
        whyItMatters=(
            "It stops SEO Maker treating on-page authority claims - awards, credentials, trust badges - as "
            "evidence, and frames reputation as something earned off-site."
        ),
        appliesWhen=[
            "A page makes strong on-site claims about its own authority",
            "Assessing whether a site is credible for its topic",
            "A site has branched into a topic outside its established area",
        ],
        doesNotApplyWhen=[
            "Small sites with little reputation information, which Google says can still be High quality",
            "Treating absence of reputation information as negative",
        ],
        entities=["site", "content", "business"],
        relatedIssues=["unsupported authority claims", "topic outside site's expertise"],
        checks=["none"],
        recommendedAction=(
            "Describe reputation as earned externally and topic-specific, and avoid citing on-page self-description "
            "as evidence of credibility."
        ),
        applicability=["content_analysis", "site_audit"],
        limitations=(
            "Rater criteria requiring off-site research that a crawl-based tool cannot perform. Google explicitly "
            "says a page can be High quality with no reputation information available."
        ),
        relatedKnowledge=["seo-qrg-who-is-responsible", "myth-domain-authority-ranking-factor", "seo-qrg-site-reputation-abuse"],
        tags=["reputation", "trust", "off_site"],
        location="Section 2.5 Understanding the Website, page 18; Section 3.3, page 23",
        quote="When there is disagreement between what the website or content creators say about themselves and what reputable independent sources say, trust the independent sources.",
    ),
    it(
        id="seo-qrg-conflict-of-interest",
        category="content", topic="reputation", subtopic="conflict_of_interest",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="A conflict of interest undermines trustworthiness, including in reviews",
        principle=(
            "Google states that a website or content creator may not be a trustworthy source where there is a clear "
            "conflict of interest: product reviews by people who own the product and share their experiences can be "
            "very valuable, but reviews by the product manufacturer, or by an influencer paid to promote the "
            "product, are not as trustworthy."
        ),
        explanation=(
            "Self-reviews and undisclosed paid endorsements are a credibility problem with a named mechanism. This "
            "matters on ecommerce and affiliate sites where reviews are a core content type."
        ),
        whyItMatters=(
            "Review content is central to many commercial sites, and this gives SEO Maker a precise reason to flag "
            "first-party or undisclosed sponsored reviews."
        ),
        appliesWhen=[
            "A site reviews its own products or services",
            "Review content carries no disclosure of a commercial relationship",
            "Auditing affiliate or comparison content",
        ],
        doesNotApplyWhen=[
            "Genuine first-hand reviews by independent users, which Google describes as valuable",
            "Clearly labelled product descriptions that do not present themselves as reviews",
        ],
        entities=["content", "page", "business"],
        relatedIssues=["self-reviews", "undisclosed sponsored content", "affiliate disclosure"],
        checks=["none"],
        recommendedAction=(
            "Flag review content produced by the seller or by paid promoters, and recommend clear disclosure or "
            "independent sourcing."
        ),
        applicability=["content_analysis", "ecommerce_analysis", "page_audit"],
        limitations=(
            "Rater criteria. Detecting undisclosed commercial relationships from a crawl is generally not possible, "
            "so this supports interpretation rather than detection."
        ),
        relatedKnowledge=["seo-qrg-independent-sources-win", "seo-content-who-how-why"],
        tags=["reviews", "conflict_of_interest", "disclosure", "ecommerce"],
        location="Section 3.4 E-E-A-T, page 27",
        quote="\"reviews\" by the product manufacturer (\"Our product is great!\") or \"reviews\" from an influencer who is paid to promote the product are not as trustworthy due to the conflict of interest.",
    ),
    it(
        id="seo-qrg-lacking-eeat-cannot-be-offset",
        category="content", topic="eeat", subtopic="threshold",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Lacking E-E-A-T for the page's purpose cannot be offset by reputation or site type",
        principle=(
            "Google states that the Low rating should be used if a page lacks appropriate E-E-A-T for its purpose, "
            "and that no other considerations - such as positive reputation or the type of website - can overcome a "
            "lack of E-E-A-T for the topic or purpose of the page. Its examples include a restaurant review by "
            "someone who never ate there, skydiving instructions from a non-expert, tax forms on a cooking site, and "
            "a shopping page with minimal customer service information."
        ),
        explanation=(
            "A trusted site publishing content outside its competence does not inherit credibility. This is the "
            "rater-side counterpart to the site reputation abuse policy."
        ),
        whyItMatters=(
            "It gives SEO Maker a basis for flagging topic drift on otherwise strong sites, which is a common "
            "pattern when a brand expands into content marketing."
        ),
        appliesWhen=[
            "A site publishes content well outside its established topic",
            "Content requires expertise the creator does not evidently have",
            "A transactional page lacks customer service information",
        ],
        doesNotApplyWhen=[
            "Content where first-hand experience rather than formal expertise is what the purpose calls for",
        ],
        entities=["page", "content", "site"],
        relatedIssues=["topic drift", "content outside site expertise", "missing customer service info"],
        checks=["none"],
        recommendedAction=(
            "Flag content that falls outside the site's demonstrated competence and recommend either genuine "
            "expertise input or narrowing the topic scope."
        ),
        applicability=["content_analysis", "site_audit", "spam_risk_analysis"],
        limitations=(
            "Rater criteria, not an algorithmic rule. Judging required expertise depends on the topic and on the "
            "page's specific purpose."
        ),
        relatedKnowledge=["seo-content-eeat-trust-central", "seo-qrg-site-reputation-abuse", "seo-qrg-ymyl-experience-or-expertise"],
        tags=["eeat", "topic_drift", "expertise", "page_quality"],
        location="Section 5.1 Lacking E-E-A-T, page 60",
        quote="The Low rating should be used if the page lacks appropriate E-E-A-T for its purpose. No other considerations such as positive reputation or the type of website can overcome a lack of E-E-A-T.",
    ),

    # ---------- YMYL ----------
    it(
        id="seo-qrg-ymyl-categories",
        category="content", topic="ymyl", subtopic="categories",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="YMYL divides into Health or Safety, Financial Security, Government Civics and Society, and Other",
        principle=(
            "Google's guidelines define four YMYL harm types: YMYL Health or Safety, covering mental, physical and "
            "emotional health and any form of safety; YMYL Financial Security, covering topics that could damage a "
            "person's ability to support themselves and their family; YMYL Government, Civics and Society, covering "
            "public interest, trust in public institutions, elections and voting; and YMYL Other. A topic is YMYL "
            "either because the topic itself is harmful or because harm could result if the content is inaccurate."
        ),
        explanation=(
            "These four categories let SEO Maker classify a site's subject matter and scale content-credibility "
            "severity accordingly, rather than treating YMYL as a single yes-or-no flag."
        ),
        whyItMatters=(
            "Business context is one of the inputs SEO Maker collects. This is the taxonomy that turns that context "
            "into differentiated severity."
        ),
        appliesWhen=[
            "Classifying a site's topic area for severity weighting",
            "Deciding how strict to be about sourcing and accuracy",
        ],
        doesNotApplyWhen=[
            "Treating YMYL as a fixed list of industries - Google describes it as a spectrum judged by potential harm",
            "Implying a YMYL classification is itself a penalty",
        ],
        entities=["site", "content", "business"],
        relatedIssues=["YMYL classification", "insufficient sourcing on sensitive topics"],
        checks=["none"],
        recommendedAction=(
            "Classify the site against the four YMYL harm types and raise credibility, sourcing and accuracy "
            "severity where it lands in a clear category."
        ),
        applicability=["content_analysis", "site_audit", "prioritisation"],
        limitations=(
            "Google stresses YMYL is a spectrum - clear YMYL, definitely not, or something in between - and says "
            "many or most topics are not YMYL."
        ),
        relatedKnowledge=["seo-content-ymyl", "seo-qrg-ymyl-diagnostic-questions", "seo-content-ymyl-extra-weight"],
        tags=["ymyl", "severity", "classification"],
        location="Section 2.3 Your Money or Your Life (YMYL) Topics, page 11",
        quote="YMYL Health or Safety [...] YMYL Financial Security [...] YMYL Government, Civics & Society [...] YMYL Other",
    ),
    it(
        id="seo-qrg-ymyl-diagnostic-questions",
        category="content", topic="ymyl", subtopic="diagnosis",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Two questions decide whether a topic is YMYL",
        principle=(
            "Google offers two diagnostic questions: would a careful person seek out experts or highly trusted "
            "sources to prevent harm, and could even minor inaccuracies cause harm - if yes, the topic is likely "
            "YMYL; and is the specific topic one most people would be content casually consulting their friends "
            "about - if yes, it is likely not YMYL. Google also notes that many or most topics are not YMYL."
        ),
        explanation=(
            "These questions are directly usable by the AI layer to classify a site's topic without needing an "
            "industry lookup table, and they produce a defensible explanation of the classification."
        ),
        whyItMatters=(
            "Industry-based YMYL lists misclassify constantly. A harm-based test handles the ambiguous middle, "
            "which is where most real sites sit."
        ),
        appliesWhen=[
            "A site's topic is not obviously YMYL or non-YMYL",
            "Justifying why a severity level was raised for a given site",
        ],
        doesNotApplyWhen=[
            "Clear cases at either extreme, where the classification needs no reasoning",
        ],
        entities=["site", "content", "business"],
        relatedIssues=["YMYL classification ambiguity"],
        checks=["none"],
        recommendedAction=(
            "Apply the two questions to classify the topic, and state the reasoning when raising severity so the "
            "user can see why the standard changed."
        ),
        applicability=["content_analysis", "site_audit", "prioritisation", "reporting_language"],
        limitations=(
            "A judgement aid for human raters. It gives no threshold and depends on understanding the specific "
            "topic, not just the industry."
        ),
        relatedKnowledge=["seo-qrg-ymyl-categories", "seo-content-ymyl"],
        tags=["ymyl", "classification", "harm"],
        location="Section 2.3 Your Money or Your Life (YMYL) Topics, page 12",
        quote="Would a careful person seek out experts or highly trusted sources to prevent harm? Could even minor inaccuracies cause harm? If yes, then the topic is likely YMYL.",
    ),
    it(
        id="seo-qrg-ymyl-experience-or-expertise",
        category="content", topic="ymyl", subtopic="experience_vs_expertise",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="On YMYL topics, lived experience and expert information serve different purposes",
        principle=(
            "Google states that pages sharing first-hand life experience on clear YMYL topics may be considered to "
            "have high E-E-A-T as long as the content is trustworthy, safe, and consistent with well-established "
            "expert consensus, while some types of YMYL information and advice must come from experts. Its examples "
            "contrast non-medical sleep tips from people who have been pregnant with which sleep medications are "
            "safe during pregnancy, and a forum discussion about coping with liver cancer treatment with treatment "
            "options and life expectancies."
        ),
        explanation=(
            "A YMYL classification does not mean every page needs credentialed authorship. The distinction is "
            "whether the page gives information and advice or shares experience."
        ),
        whyItMatters=(
            "Blanket 'add a medical reviewer' advice on every page of a health site is unhelpful and often wrong. "
            "This item lets SEO Maker target that recommendation where it belongs."
        ),
        appliesWhen=[
            "A YMYL site contains both experiential and advisory content",
            "Deciding whether to recommend expert authorship or review for a page",
        ],
        doesNotApplyWhen=[
            "Experiential content that contradicts well-established expert consensus, which Google does not excuse",
            "Non-YMYL topics",
        ],
        entities=["page", "content"],
        relatedIssues=["missing expert review", "experiential content on sensitive topics"],
        checks=["none"],
        recommendedAction=(
            "Distinguish experiential from advisory pages and recommend expert authorship or review only for the "
            "advisory ones, while requiring consistency with expert consensus throughout."
        ),
        applicability=["content_analysis", "page_audit", "prioritisation"],
        limitations=(
            "Rater criteria. The boundary between sharing experience and giving advice requires judgement, and "
            "safety and consensus consistency apply to both."
        ),
        relatedKnowledge=["seo-qrg-ymyl-categories", "seo-content-eeat-trust-central", "seo-content-ymyl-extra-weight"],
        tags=["ymyl", "eeat", "experience", "expertise"],
        location="Section 3.4.1 YMYL Topics: Experience or Expertise?, page 28",
        quote="Pages that share first-hand life experience on clear YMYL topics may be considered to have high E-E-A-T as long as the content is trustworthy, safe, and consistent with well-established expert consensus.",
    ),

    # ---------- spam ----------
    it(
        id="seo-qrg-scaled-content-abuse",
        category="content", topic="scaled_content_abuse", subtopic="definition",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Scaled content abuse is about value and purpose, not about how content was produced",
        principle=(
            "Google defines scaled content abuse as generating many pages primarily to benefit the website owner "
            "rather than help users, typically creating large amounts of unoriginal content providing little to no "
            "value compared to other similar pages on the web, no matter how it is created. Named examples include "
            "using automated tools including generative AI as a low-effort way to produce many low-value pages; "
            "scraping feeds or search results, including through synonymizing or translation; stitching content from "
            "different pages without adding value; creating multiple sites to hide the scaled nature of the content; "
            "and creating many pages that make little sense to a reader but contain search keywords."
        ),
        explanation=(
            "The repeated phrase is no matter how it is created. Volume plus low value plus owner-benefit purpose "
            "is the pattern, and SEO Maker can observe the first two across a crawl."
        ),
        whyItMatters=(
            "It is the precise definition behind Google's scaled content spam policy, and it lets SEO Maker discuss "
            "AI-assisted content risk accurately instead of vaguely."
        ),
        appliesWhen=[
            "A site shows large volumes of templated or near-identical low-value pages",
            "Content appears scraped, machine-translated or stitched from other sources",
            "A user asks about publishing content at scale",
        ],
        doesNotApplyWhen=[
            "Large sites with genuinely distinct, valuable pages",
            "Licensed or syndicated content, which Google says should not be considered copied",
        ],
        entities=["site", "content", "page"],
        relatedIssues=["mass-generated content", "scraped content", "templated low-value pages"],
        checks=["words", "canonical"],
        recommendedAction=(
            "Where volume and low value coincide, name the pattern and recommend consolidation or genuine added "
            "value. Never recommend scaled publishing."
        ),
        applicability=["content_analysis", "spam_risk_analysis", "site_audit"],
        limitations=(
            "Rater guidance on a spam policy, with no published page-count threshold. Google instructs raters to "
            "look at several pages of a site before concluding, and a crawl sample may not be representative."
        ),
        relatedKnowledge=["seo-content-automation-for-rankings-is-spam", "seo-qrg-copied-paraphrased-content", "geo-google-fanout-content-abuse"],
        tags=["scaled_content", "spam_policy", "ai_content", "scraping"],
        location="Section 4.6.5 Scaled Content Abuse, page 41",
        quote="This practice is typically focused on creating large amounts of unoriginal content that provides little to no value for website visitors compared to other similar pages on the web, no matter how it's created.",
    ),
    it(
        id="seo-qrg-genai-tools-neutral",
        category="content", topic="ai_generated_content", subtopic="tool_neutrality",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Using generative AI tools alone does not determine content quality",
        principle=(
            "Google states that the use of generative AI tools alone does not determine the level of effort or the "
            "Page Quality rating: such tools may be used for high quality and low quality content creation. It gives "
            "creating high quality original artwork with generative AI as an example of high effort, while noting "
            "the same tools can produce Lowest quality content with little effort, originality or added value."
        ),
        explanation=(
            "This is the strongest available statement that production method is not the criterion, and it comes "
            "from the same document that defines scaled content abuse - so both halves are authoritative."
        ),
        whyItMatters=(
            "SEO Maker generates content suggestions with AI. It needs an accurate, quotable position that avoids "
            "both scaremongering and complacency."
        ),
        appliesWhen=[
            "A user asks whether AI-assisted content will hurt their site",
            "Recommending AI-assisted content production",
            "Assessing content that appears machine-generated",
        ],
        doesNotApplyWhen=[
            "Unreviewed mass generation, which falls squarely under scaled content abuse",
        ],
        entities=["content", "page"],
        relatedIssues=["AI content concerns", "machine-generated content"],
        checks=["none"],
        recommendedAction=(
            "State that the tool used is not the criterion, and direct the assessment to effort, originality and "
            "added value instead."
        ),
        applicability=["content_analysis", "myth_guard", "reporting_language"],
        limitations=(
            "Google states elsewhere that scaled low-value content remains a spam concern regardless of production "
            "method, so this does not license unreviewed generation."
        ),
        relatedKnowledge=["seo-content-ai-generated-content-stance", "myth-ai-content-cannot-rank", "seo-qrg-scaled-content-abuse", "seo-content-ai-disclosure"],
        tags=["ai_content", "myth_guard", "page_quality"],
        location="Section 4.6.6, page 42",
        quote="the use of Generative AI tools alone does not determine the level of effort or Page Quality rating. Generative AI tools may be used for high quality and low quality content creation.",
    ),
    it(
        id="seo-qrg-copied-paraphrased-content",
        category="content", topic="content_originality", subtopic="copied_content",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Copying or paraphrasing is not automatically low quality; the test is effort, originality and added value",
        principle=(
            "Google states that copying, paraphrasing, embedding or reposting content does not automatically make a "
            "page Lowest quality, but that the Lowest rating is required when all or almost all of the MC is copied, "
            "paraphrased, embedded or reposted with little to no effort, originality and added value. Where there is "
            "low - rather than no - effort to add value by editing, curating, reformatting or injecting original "
            "content, the Low rating applies. Licensed or syndicated content, such as AP or Reuters news articles, "
            "should not be considered copied."
        ),
        explanation=(
            "There is a graded scale here, plus an explicit syndication exemption. SEO Maker should not report "
            "content overlap as a defect without assessing what the page adds."
        ),
        whyItMatters=(
            "Duplicate-detection findings are easy to produce and frequently wrong about syndicated or licensed "
            "content, which is entirely legitimate."
        ),
        appliesWhen=[
            "Page content overlaps substantially with other pages on the web",
            "A site republishes or aggregates third-party content",
        ],
        doesNotApplyWhen=[
            "Licensed or syndicated content, which Google explicitly exempts",
            "A site's own duplicate URLs, which is a canonicalisation matter rather than an originality one",
        ],
        entities=["page", "content"],
        relatedIssues=["copied content", "scraped content", "aggregated content", "syndicated content"],
        checks=["words"],
        recommendedAction=(
            "Where content is reproduced, assess and report what the page adds. Treat syndication as legitimate and "
            "recommend added commentary, curation or original material where it is absent."
        ),
        applicability=["content_analysis", "page_audit", "spam_risk_analysis"],
        limitations=(
            "Rater criteria. Google acknowledges that identifying the original source is often difficult and that "
            "paraphrased content is much harder to recognise than copied content."
        ),
        relatedKnowledge=["seo-qrg-scaled-content-abuse", "seo-qrg-mc-quality-dimensions", "seo-tech-duplicate-content-not-penalty"],
        tags=["originality", "copied_content", "syndication", "aggregation"],
        location="Section 4.6.6, page 42; Section 5.2.1, page 61",
        quote="Copying, paraphrasing, embedding or reposting content does not automatically make a page Lowest quality. [...] Licensed or syndicated content should not be considered as \"copied\".",
    ),
    it(
        id="seo-qrg-expired-domain-abuse",
        category="content", topic="expired_domain_abuse", subtopic="definition",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Expired domain abuse: repurposing a trusted domain for unrelated low-value content",
        principle=(
            "Google defines expired domain abuse as purchasing an expired domain and repurposing it primarily to "
            "benefit the new owner by hosting content of little to no value, often trading on the reputation of a "
            "former government, charity or school site. Its examples include affiliate content on a former "
            "government agency site, commercial medical products on a former medical charity site, and casino "
            "content on a former elementary school site. Google suggests checking the Internet Archive to confirm "
            "an obvious change of purpose."
        ),
        explanation=(
            "The detectable signal is a mismatch between what the domain's URL structure and history imply and what "
            "the site now publishes. This is relevant when auditing an acquired domain."
        ),
        whyItMatters=(
            "Domain acquisition is sometimes recommended as an SEO shortcut. This names it as a spam pattern and "
            "gives a concrete verification method."
        ),
        appliesWhen=[
            "A site's current topic is inconsistent with its domain name or historical URL structure",
            "A user asks about buying an expired domain for its existing authority",
        ],
        doesNotApplyWhen=[
            "Legitimate rebrands and business pivots that keep serving the audience",
            "Domain purchases where the new site is genuinely valuable",
        ],
        entities=["site", "business"],
        relatedIssues=["repurposed expired domain", "domain history mismatch"],
        checks=["none"],
        recommendedAction=(
            "Where a domain's history and current content conflict, flag it and point to the Internet Archive as "
            "the verification route. Do not recommend acquiring domains for residual authority."
        ),
        applicability=["site_audit", "spam_risk_analysis", "myth_guard"],
        limitations=(
            "Rater guidance on a spam policy. A crawl alone cannot establish domain history, so this supports "
            "interpretation and a manual check rather than detection."
        ),
        relatedKnowledge=["seo-qrg-site-reputation-abuse", "myth-domain-authority-ranking-factor"],
        tags=["expired_domains", "spam_policy", "domain_history"],
        location="Section 4.6.3 Expired Domain Abuse, page 40",
        quote="Expired domain abuse is where an expired domain name is purchased and repurposed primarily to benefit the new website owner by hosting content that provides little to no value to users.",
    ),
    it(
        id="seo-qrg-site-reputation-abuse",
        category="content", topic="site_reputation_abuse", subtopic="definition",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Site reputation abuse: third-party content hosted to borrow the host's ranking signals",
        principle=(
            "Google defines site reputation abuse as publishing third-party content on a host site mainly because of "
            "that host's already-established ranking signals, so the content ranks better than it could on its own. "
            "Third-party content alone is not abuse - it is abuse only when the reason for hosting it is the host's "
            "ranking signals. Named examples include payday-loan reviews on an educational site, casino pages on a "
            "medical site, and white-label coupons on a news site. Wire services, syndicated news, user-generated "
            "content sections, editorial columns and ordinary affiliate links are explicitly not site reputation "
            "abuse."
        ),
        explanation=(
            "The detectable pattern is a section whose topic is unrelated to the rest of the site and which a reader "
            "would be surprised to find there. Google's own exclusion list prevents over-flagging."
        ),
        whyItMatters=(
            "Hosted coupon, casino and comparison sections on established sites are a widespread pattern, and the "
            "exclusion list is what keeps SEO Maker from flagging legitimate syndication and UGC."
        ),
        appliesWhen=[
            "A site hosts a content section clearly unrelated to its main topic",
            "Sections appear to be operated by a third party or white-label provider",
        ],
        doesNotApplyWhen=[
            "Wire service or press release sites",
            "Syndicated news, UGC sections, editorial columns, or advertorials shared directly with readers",
            "Ordinary affiliate links or third-party ad units used throughout a page",
        ],
        entities=["site", "content"],
        relatedIssues=["unrelated hosted sections", "white-label content", "parasite content"],
        checks=["none"],
        recommendedAction=(
            "Flag topically unrelated hosted sections and check them against Google's exclusion list before "
            "reporting, naming which pattern applies."
        ),
        applicability=["site_audit", "spam_risk_analysis", "content_analysis"],
        limitations=(
            "The violation turns on the reason for hosting, which is not observable from a crawl. Google's list of "
            "exclusions is broad and must be applied before flagging."
        ),
        relatedKnowledge=["seo-qrg-lacking-eeat-cannot-be-offset", "seo-qrg-expired-domain-abuse"],
        tags=["site_reputation_abuse", "spam_policy", "third_party_content"],
        location="Section 4.6.4 Site Reputation Abuse, pages 40-41",
        quote="Having third-party content alone isn't site reputation abuse; it's only site reputation abuse if the third-party content is published on a host site mainly because of that host site's already-established ranking signals.",
    ),
    it(
        id="seo-qrg-spammed-comments",
        category="content", topic="hacked_content", subtopic="spammed_comments",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Hacked pages and heavily spammed comment sections are rated Lowest",
        principle=(
            "Google states that hacked, defaced or bot-spammed pages should be rated Lowest because they fail to "
            "achieve their original purpose, that responsible website owners should regularly check their sites for "
            "suspicious behaviour, and that if a specific page has many unrelated spammed comments - often posted by "
            "bots to advertise a product or create a link - the page should be rated Lowest."
        ),
        explanation=(
            "Unmoderated comment sections are a real quality liability, not just an aesthetic one, and comment spam "
            "is partly observable from crawled page content and outbound link patterns."
        ),
        whyItMatters=(
            "Abandoned comment sections accumulate spam silently on otherwise healthy sites, and this gives the "
            "finding a clear severity."
        ),
        appliesWhen=[
            "Pages carry many unrelated comments with outbound commercial links",
            "A site shows injected content inconsistent with its purpose",
        ],
        doesNotApplyWhen=[
            "Moderated comment sections with genuine discussion, which Google treats as contributing effort",
        ],
        entities=["page", "site", "content", "link"],
        relatedIssues=["comment spam", "hacked content", "injected links"],
        checks=["links"],
        recommendedAction=(
            "Flag pages with heavy comment spam and recommend moderation, closing old comment threads, and "
            "automatic link annotation for user-generated content."
        ),
        applicability=["site_audit", "spam_risk_analysis", "page_audit"],
        limitations=(
            "Rater criteria. Distinguishing spam comments from genuine discussion requires reading them, and a "
            "crawl may not capture comments loaded asynchronously."
        ),
        relatedKnowledge=["seo-il-outbound-link-qualification"],
        tags=["comment_spam", "hacked_content", "ugc", "moderation"],
        location="Section 4.6.2 Hacked, Defaced, or Spammed Pages, page 39",
        quote="If a specific page on a website has many unrelated \"spammed\" comments, the page should be rated Lowest.",
    ),

    # ---------- queries, intent, freshness ----------
    it(
        id="seo-content-google-intent-taxonomy",
        category="content", topic="search_intent", subtopic="google_taxonomy",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Google's own intent taxonomy is Know, Know Simple, Do, Website and Visit-in-person",
        principle=(
            "Google's rater guidelines classify query intent as Know queries (finding information or exploring a "
            "topic), of which Know Simple queries seek a specific correct answer that fits in one or two sentences "
            "or a short list; Do queries, where the user wants to accomplish a goal or activity; Website queries, "
            "seeking a specific site or page; and Visit-in-person queries, seeking a business or a category of "
            "businesses. Google notes a query may have more than one of these intents and that the line between Do "
            "and Know is sometimes blurry."
        ),
        explanation=(
            "This is Google's operational taxonomy and it differs from the classic three-class academic model. It "
            "adds a local intent class and separates simple-answer queries, both of which matter for page-type "
            "matching."
        ),
        whyItMatters=(
            "Matching page type to intent is central to content recommendations, and using Google's own categories "
            "is more defensible than the industry's four-class variant."
        ),
        appliesWhen=[
            "Assessing whether a page type matches the intent it targets",
            "Classifying queries for content recommendations",
            "A local business site is being audited",
        ],
        doesNotApplyWhen=[
            "Assuming intent can be read reliably from a query string alone",
            "Treating the categories as mutually exclusive - Google says many queries do not fit neatly into one",
        ],
        entities=["query", "page", "content"],
        relatedIssues=["page type does not match intent", "intent mismatch"],
        checks=["none"],
        recommendedAction=(
            "Classify target intent with Google's categories and check the page type serves it, noting where a "
            "query carries more than one intent."
        ),
        applicability=["intent_analysis", "content_analysis", "page_audit", "local_analysis"],
        limitations=(
            "Rater criteria for human judgement. Google states the categories illustrate big-picture patterns and "
            "that many queries do not fit neatly into one."
        ),
        relatedKnowledge=["seo-content-search-intent-taxonomy", "seo-research-broder-intent-distribution", "seo-qrg-query-multiple-meanings"],
        tags=["search_intent", "taxonomy", "query_classification"],
        location="Section 12.7 Understanding User Intent, page 101",
        quote="Know query, some of which are Know Simple queries [...] Do query [...] Website query [...] Visit-in-person query",
    ),
    it(
        id="seo-qrg-query-multiple-meanings",
        category="content", topic="search_intent", subtopic="ambiguity",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Queries can carry several meanings, shift over time, and depend on user location",
        principle=(
            "Google states that many queries have more than one meaning - its example is mercury, which may mean "
            "the planet or the element - that user location informs intent, such as coffee shops meaning coffee "
            "shops in London for a London user, and that users are assumed to be looking for current information, "
            "so raters should think about a query's current meaning."
        ),
        explanation=(
            "A single page cannot serve every interpretation of an ambiguous query, and the dominant interpretation "
            "can move. Recommendations built on one assumed meaning may be wrong."
        ),
        whyItMatters=(
            "It sets a limit on how confidently SEO Maker should assert what a target query means, especially for "
            "short head terms and brand-adjacent words."
        ),
        appliesWhen=[
            "A target query is short, ambiguous, or shares a name with something else",
            "Content targets a term whose common meaning may have shifted",
            "Local intent may be involved",
        ],
        doesNotApplyWhen=[
            "Unambiguous long-tail queries with a single clear reading",
        ],
        entities=["query", "content", "page"],
        relatedIssues=["ambiguous target query", "intent assumption risk"],
        checks=["none"],
        recommendedAction=(
            "State the assumed interpretation explicitly when making intent-based recommendations, and flag when a "
            "query plausibly carries other meanings."
        ),
        applicability=["intent_analysis", "content_analysis", "reporting_language"],
        limitations=(
            "Rater guidance. Determining the dominant interpretation requires current search data that a crawl does "
            "not provide."
        ),
        relatedKnowledge=["seo-content-google-intent-taxonomy", "seo-research-broder-intent-uncertainty"],
        tags=["search_intent", "ambiguity", "locale", "query_meaning"],
        location="Section 12.5-12.7, pages 98-101",
        quote="many queries also have more than one meaning. For example, if a user searches for \"mercury,\" their intent may be to learn more about the planet mercury or the chemical element.",
    ),
    it(
        id="seo-qrg-freshness-query-types",
        category="content", topic="freshness", subtopic="query_types",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Four query types demand fresh content; for the rest, stale pages can still be high quality",
        principle=(
            "Google names four query types demanding current results: breaking news queries; recurring event "
            "queries such as elections, sports, TV shows and tax forms; current information queries such as "
            "populations, debt figures and airfares; and product queries, where users are assumed to want the most "
            "recent model or version. For these, pages about past events or outdated information are stale and "
            "should get low Needs Met ratings. Google adds that freshness is generally less of a concern for Page "
            "Quality: stale pages can have high Page Quality ratings, though unmaintained or inaccurate content is a "
            "reason for a low one."
        ),
        explanation=(
            "Freshness is query-dependent, not a universal content property. This lets SEO Maker target refresh "
            "recommendations at the page types where recency actually matters."
        ),
        whyItMatters=(
            "Blanket 'update your old content' advice wastes effort on evergreen pages. Naming the four query types "
            "makes the recommendation specific and defensible."
        ),
        appliesWhen=[
            "A page targets news, recurring events, current figures, or products",
            "Deciding which pages to recommend refreshing",
            "Content references dated models, prices or years",
        ],
        doesNotApplyWhen=[
            "Evergreen or archival content, which Google says can be stale and still high quality",
            "Recommending date changes without content changes",
        ],
        entities=["page", "content", "query"],
        relatedIssues=["stale content", "outdated product information", "old event content"],
        checks=["none"],
        recommendedAction=(
            "Recommend refreshing only pages whose query type demands currency, and say why that page type needs it."
        ),
        applicability=["freshness_analysis", "content_analysis", "page_audit", "prioritisation"],
        limitations=(
            "Rater criteria affecting Needs Met rather than Page Quality. Google also warns that the displayed date "
            "may not reflect when content was actually updated."
        ),
        relatedKnowledge=["myth-date-refresh-for-freshness", "seo-content-starter-quality-attributes"],
        tags=["freshness", "staleness", "query_types", "content_refresh"],
        location="Section 18.0 Needs Met Rating and Freshness, page 158",
        quote="Freshness is generally less of a concern for Page Quality rating. \"Stale\" pages can have high Page Quality ratings.",
    ),
    it(
        id="seo-qrg-specificity-matching",
        category="content", topic="search_intent", subtopic="specificity",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="A landing page can be more or less specific than the query and still be helpful",
        principle=(
            "Google's guidelines discuss query specificity and state that the rating is based on how helpful the "
            "result is for the query, not on the specificity fit. A page more specific than a broad query can still "
            "be very helpful when it represents a popular or prominent option, while a page too specific for the "
            "query is a less helpful result. For broad category queries, popular and prominent examples may be "
            "considered very helpful."
        ),
        explanation=(
            "There is no rule that a page must match a query's specificity level. Helpfulness is the criterion, "
            "which loosens the common advice to build a page per query granularity."
        ),
        whyItMatters=(
            "It counters the reflex to recommend a new page whenever a query does not have an exact-match landing "
            "page, which feeds directly into content bloat."
        ),
        appliesWhen=[
            "Deciding whether an existing page can serve a target query",
            "A user proposes creating pages at every specificity level",
        ],
        doesNotApplyWhen=[
            "Pages so specific that they address an unlikely minor interpretation, which Google rates lower",
        ],
        entities=["page", "query", "content"],
        relatedIssues=["proposed page proliferation", "landing page selection"],
        checks=["none"],
        recommendedAction=(
            "Judge whether an existing page can serve the query helpfully before recommending a new one, and "
            "explain the helpfulness reasoning."
        ),
        applicability=["intent_analysis", "content_analysis", "prioritisation"],
        limitations=(
            "Rater criteria. Google notes results for specific queries are easier to rate and that broad queries "
            "require web research to know what is popular and prominent."
        ),
        relatedKnowledge=["seo-content-google-intent-taxonomy", "geo-google-fanout-content-abuse"],
        tags=["specificity", "search_intent", "landing_pages"],
        location="Section 17.0 Specificity of Queries and Landing Pages, page 154",
        quote="As always, your rating is based on how helpful the result is for the query, not the specificity fit.",
    ),

    # ---------- from the public overview ----------
    item(
        id="seo-qrg-ratings-aggregate-only",
        domain="seo", category="content", topic="quality_raters", subtopic="aggregate_use",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="No single rating or rater affects how a page ranks; ratings are used in aggregate",
        principle=(
            "Google's public overview states that no single rating and no single rater directly impacts how a page "
            "or site ranks, that using Search Quality Ratings for ranking purposes would not be feasible because "
            "humans could never rate every page on the open web, and that aggregated ratings are used to measure how "
            "well the systems are working and to give those systems positive and negative examples."
        ),
        explanation=(
            "This is the scope boundary for everything drawn from the rater guidelines. SEO Maker may use them as a "
            "quality rubric and must not present them as ranking mechanics."
        ),
        whyItMatters=(
            "A large share of the corpus comes from the rater guidelines. Carrying this boundary explicitly is what "
            "keeps that material honest in user-facing output."
        ),
        appliesWhen=[
            "Citing any rater-guideline concept",
            "A user asks whether a rater could have affected their site",
        ],
        doesNotApplyWhen=[
            "Dismissing the guidelines as irrelevant - Google says aggregated ratings shape system development",
        ],
        entities=["site", "page"],
        relatedIssues=["rater guideline misattribution"],
        checks=["none"],
        recommendedAction=(
            "Label rater-derived knowledge as evaluation criteria describing quality, never as ranking factors or "
            "algorithm behaviour."
        ),
        applicability=["reporting_language", "content_analysis", "myth_guard"],
        source=QRG_OVERVIEW,
        evidenceType="official_documentation", evidenceStrength="strong", confidence="high",
        limitations=(
            "The overview is dated November 2023 and is a summary document; the rater programme's scale figures may "
            "have changed since."
        ),
        relatedKnowledge=["seo-content-raters-do-not-rank", "seo-qrg-pq-three-steps"],
        tags=["quality_raters", "reporting_language", "scope"],
        version="Search Quality Rater Guidelines: An Overview, November 2023",
        reviewBy="2026-09-22", potentiallyOutdated=True,
        location="Section 3: The Search Quality Rating Process, pages 16-17",
        quote="It is important to note that no single rating - or single rater - directly impacts how a given page or site ranks in Search.",
    ),
    item(
        id="seo-qrg-needs-met-scale",
        domain="seo", category="content", topic="needs_met", subtopic="scale",
        knowledgeType="authoritative", claimType="evaluation_criterion",
        title="Needs Met measures usefulness for a query, with Fully Meets reserved for single-answer queries",
        principle=(
            "Google's Needs Met scale runs Fails to Meet, Slightly Meets, Moderately Meets, Highly Meets and Fully "
            "Meets. Fully Meets is described as a special category that applies only to queries with clear intent to "
            "find one specific result, and the corresponding specific result. Raters consider the extent to which a "
            "result fits the query, is up to date, is accurate and trustworthy for information-seeking queries, and "
            "satisfies the user."
        ),
        explanation=(
            "Needs Met is result-and-query specific, while Page Quality is a property of the page. A high quality "
            "page can be a poor result for a given query, and this separation is exactly the distinction SEO Maker "
            "needs when a technically sound page underperforms."
        ),
        whyItMatters=(
            "It gives the AI layer language for the most common real situation: the page is fine, but it is not the "
            "right answer to the query it targets."
        ),
        appliesWhen=[
            "A technically sound, well-written page does not perform for its target query",
            "Explaining the difference between page quality and query fit",
        ],
        doesNotApplyWhen=[
            "Treating the scale as a ranking output",
            "Queries with no single intended result, where Fully Meets does not apply",
        ],
        entities=["page", "query", "content"],
        relatedIssues=["good page wrong query", "intent mismatch"],
        checks=["none"],
        recommendedAction=(
            "Separate page quality from query fit in findings, and where the page is sound, direct the "
            "recommendation at intent match rather than content quality."
        ),
        applicability=["intent_analysis", "content_analysis", "page_audit", "reporting_language"],
        source=QRG_OVERVIEW,
        evidenceType="official_documentation", evidenceStrength="strong", confidence="high",
        limitations=(
            "Rater criteria from a November 2023 summary. The full guidelines carry the detailed definitions, and "
            "ratings do not directly affect rankings."
        ),
        relatedKnowledge=["seo-qrg-ratings-aggregate-only", "seo-content-google-intent-taxonomy", "seo-qrg-specificity-matching"],
        tags=["needs_met", "search_intent", "evaluation"],
        version="Search Quality Rater Guidelines: An Overview, November 2023",
        reviewBy="2026-09-22", potentiallyOutdated=True,
        location="Section 3: The Search Quality Rating Process, pages 28-30",
        quote="Fully Meets (FullyM): A special rating category, which only applies to queries with clear intent to find one specific result and the corresponding specific result the user is looking for.",
    ),
]
