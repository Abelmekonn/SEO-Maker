# -*- coding: utf-8 -*-
"""Knowledge extracted from Google's SEO Starter Guide (last updated 2025-12-10)."""

from common import item, STARTER

COMMON = dict(
    domain="seo", source=STARTER,
    evidenceType="official_documentation", evidenceStrength="strong", confidence="high",
    version="Google Search Central, last updated 2025-12-10", reviewBy="2027-03-22",
)


def it(**kw):
    return item(**{**COMMON, **kw})


ITEMS = [
    # ---------- crawling / discovery ----------
    it(
        id="seo-tech-discovery-via-links",
        category="technical", topic="crawling", subtopic="discovery",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google finds most pages by following links from pages it has already crawled",
        principle=(
            "Google states that it primarily finds pages through links from other pages it has already crawled, and "
            "that the vast majority of new pages it finds every day are discovered through links."
        ),
        explanation=(
            "Internal linking is the primary discovery mechanism, not a secondary optimisation. A page with no "
            "inbound internal link depends entirely on weaker channels such as a sitemap."
        ),
        whyItMatters=(
            "It gives orphan-page findings a first-party justification: the page is missing the main route by which "
            "Google discovers content."
        ),
        appliesWhen=[
            "A crawled URL has zero internal inbound links",
            "A URL appears in the sitemap or analytics but never as a crawl target",
            "Explaining why new pages are slow to be discovered",
        ],
        doesNotApplyWhen=[
            "The page is deliberately excluded from indexing",
            "Explaining why a discovered page was not indexed - discovery and indexing are different stages",
        ],
        entities=["page", "site", "link"],
        relatedIssues=["orphan page", "page not discovered", "weak internal linking"],
        checks=["links", "sitemap_audit", "crawl_plan"],
        recommendedAction=(
            "Link the page from related pages that are themselves crawled. Treat sitemap inclusion as a supplement "
            "to internal links, not a replacement."
        ),
        applicability=["internal_link_analysis", "site_audit", "crawl_analysis"],
        limitations=(
            "Discovery is not indexing: a well-linked page can still be excluded for quality, duplication or "
            "directive reasons. Google also discovers URLs through other channels it does not fully enumerate."
        ),
        relatedKnowledge=["seo-il-internal-links-discovery", "seo-tech-sitemap-not-required"],
        tags=["crawling", "internal_links", "discovery", "orphan_pages"],
        location="Section: Help Google find your content",
        quote="Google primarily finds pages through links from other pages it already crawled.",
    ),
    it(
        id="seo-tech-sitemap-not-required",
        category="technical", topic="sitemap", subtopic="necessity",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="A sitemap is optional, and internal linking comes first",
        principle=(
            "Google describes submitting a sitemap as an optional technical step, notes that some CMSes generate one "
            "automatically, and says site owners should first focus on making sure people know about the site."
        ),
        explanation=(
            "A missing sitemap is a low-priority opportunity, not a defect. Where a site has a discovery problem, "
            "internal linking is the higher-leverage fix."
        ),
        whyItMatters=(
            "Tools routinely report a missing sitemap as a serious issue. Google's own framing puts it well below "
            "linking and promotion, which should shape how SEO Maker ranks the finding."
        ),
        appliesWhen=[
            "A site has no XML sitemap",
            "Prioritising discovery-related recommendations",
        ],
        doesNotApplyWhen=[
            "Large sites or sites with poorly linked sections, where sitemaps carry more weight",
            "A sitemap exists but contradicts the site's indexing signals - that is a separate, real defect",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["no sitemap found", "sitemap not declared in robots.txt"],
        checks=["sitemap", "sitemap_audit"],
        recommendedAction=(
            "Report a missing sitemap as a low-severity opportunity. Recommend it confidently only for large sites, "
            "new sites, or sites with weakly linked sections."
        ),
        applicability=["technical_audit", "site_audit", "prioritisation"],
        limitations=(
            "Google's own sitemap documentation is more positive about sitemaps for large or poorly linked sites; "
            "this item is about baseline necessity, not about the value of a well-formed sitemap."
        ),
        relatedKnowledge=["seo-tech-sitemap-is-discovery-aid", "seo-tech-discovery-via-links"],
        tags=["sitemap", "prioritisation", "crawling"],
        location="Section: Help Google find your content",
        quote="However this isn't required, and you should first focus on making sure people know about your site.",
    ),
    it(
        id="seo-tech-render-resources-must-be-crawlable",
        category="technical", topic="rendering", subtopic="blocked_resources",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Blocking CSS or JavaScript can stop Google understanding a page",
        principle=(
            "Google states that when it crawls a page it should ideally see the page the same way an average user "
            "does, which requires access to the same resources as the user's browser. Hiding important components "
            "such as CSS and JavaScript may mean Google cannot understand the pages, so they might not show up in "
            "search results or rank well for the targeted terms."
        ),
        explanation=(
            "A robots.txt rule that blocks an assets directory is not a harmless housekeeping choice - it can "
            "degrade how the page is understood. This is checkable by testing whether referenced CSS and JS URLs "
            "are disallowed."
        ),
        whyItMatters=(
            "Blocked render resources are a common, invisible cause of poor indexing on JavaScript-heavy sites, and "
            "the fix is a one-line robots.txt change."
        ),
        appliesWhen=[
            "robots.txt disallows paths containing the page's CSS or JavaScript resources",
            "A JavaScript-rendered page indexes poorly or appears empty in rendering tests",
        ],
        doesNotApplyWhen=[
            "Blocked resources that do not affect layout or main content, such as analytics beacons",
            "Third-party resources the site does not control",
        ],
        entities=["page", "site", "technical_configuration"],
        relatedIssues=["blocked CSS/JS resources", "rendered content missing", "JavaScript SEO"],
        checks=["robots", "robots_audit", "indexability"],
        recommendedAction=(
            "Cross-check referenced CSS and JS URLs against robots.txt rules and recommend unblocking any resource "
            "needed to render main content. Verify with Search Console's URL Inspection tool."
        ),
        applicability=["technical_audit", "page_audit", "crawl_analysis", "indexability_analysis"],
        limitations=(
            "Google says it might not understand the page, not that it definitely will not. The impact depends on "
            "how much of the main content depends on the blocked resource."
        ),
        relatedKnowledge=["geo-google-crawlable-content", "seo-tech-robots-most-specific-match"],
        tags=["rendering", "javascript", "css", "robots.txt", "indexing"],
        location="Section: Check if Google can see your page the same way a user does",
        quote="If your site is hiding important components that make up your website (like CSS and JavaScript), Google might not be able to understand your pages, which means they might not show up in search results or rank well for the terms you're targeting.",
    ),
    it(
        id="seo-tech-crawler-location-us",
        category="technical", topic="geolocation", subtopic="crawler_location",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Google's crawler generally requests from a US location",
        principle=(
            "Google states that if pages show different information depending on the user's physical location, site "
            "owners should be satisfied with what Google sees from its crawler's location, which is generally the US."
        ),
        explanation=(
            "Geo-redirects and location-gated content can hide the real page from the crawler. A site that redirects "
            "non-local visitors, or serves a country picker instead of content, may be indexed on the wrong version."
        ),
        whyItMatters=(
            "It explains a whole class of otherwise baffling indexing problems on international and localised sites, "
            "and it is directly testable by comparing crawled content against what a local user sees."
        ),
        appliesWhen=[
            "A site geo-redirects or varies content by visitor location",
            "A non-US site reports that the wrong locale version is indexed",
            "Auditing an international or multi-region site",
        ],
        doesNotApplyWhen=[
            "Sites that serve identical content regardless of location",
            "Reasoning about which locale version ranks for a given user, which hreflang governs",
        ],
        entities=["site", "page", "technical_configuration"],
        relatedIssues=["geo-redirect blocking crawler", "wrong locale indexed"],
        checks=["status", "indexability", "canonical"],
        recommendedAction=(
            "Avoid automatic geo-redirects for crawlers. Serve each locale on its own crawlable URL and connect them "
            "with hreflang rather than redirecting by IP."
        ),
        applicability=["technical_audit", "international_analysis", "site_audit"],
        limitations=(
            "Google says the crawl location is generally the US, not always; it does crawl from other locations in "
            "some circumstances. SEO Maker's own crawler location may differ from Google's, so findings are indicative."
        ),
        relatedKnowledge=["seo-intl-hreflang-return-links"],
        tags=["geotargeting", "crawling", "international", "redirects"],
        location="Section: Check if Google can see your page the same way a user does",
        quote="If your pages have different information depending on the user's physical location, make sure you're satisfied with the information that Google sees from its crawler's location, which is generally the US.",
    ),

    # ---------- URLs / structure ----------
    it(
        id="seo-onpage-descriptive-urls",
        category="on_page", topic="url_structure", subtopic="descriptive_urls",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Words in a URL help users, mainly through breadcrumbs",
        principle=(
            "Google states that parts of the URL can be displayed in search results as breadcrumbs, so users can use "
            "URLs to judge whether a result will be useful, and recommends including words in the URL that may be "
            "useful for users. A URL containing only random identifiers is described as less helpful."
        ),
        explanation=(
            "The benefit Google names is user comprehension and breadcrumb display, not ranking. SEO Maker should "
            "frame URL recommendations that way and avoid implying that keywords in URLs carry ranking weight."
        ),
        whyItMatters=(
            "It lets the tool recommend readable URLs honestly, while staying consistent with Google's separate "
            "statement that keywords in the URL path have hardly any ranking effect."
        ),
        appliesWhen=[
            "URLs consist of opaque IDs, hashes, or session parameters",
            "Advising on URL structure for new sections of a site",
        ],
        doesNotApplyWhen=[
            "Existing indexed URLs where changing the URL would require redirects and risk disruption for a "
            "cosmetic gain",
            "Any claim that adding keywords to a URL will improve ranking",
        ],
        entities=["page", "site"],
        relatedIssues=["opaque URLs", "unreadable URL structure"],
        checks=["none"],
        recommendedAction=(
            "Recommend descriptive URLs for new URLs, and explicitly note that rewriting established URLs is rarely "
            "worth the redirect risk."
        ),
        applicability=["url_analysis", "page_audit", "site_audit"],
        limitations=(
            "Google states separately that keywords in the domain name or URL path alone have hardly any ranking "
            "effect beyond appearing in breadcrumbs. The benefit is user-facing."
        ),
        relatedKnowledge=["myth-keywords-in-url-rank", "seo-tech-directory-grouping"],
        tags=["urls", "breadcrumbs", "usability"],
        location="Section: Use descriptive URLs",
        quote="Parts of the URL can be displayed in search results as breadcrumbs, so users can also use the URLs to understand whether a result will be useful for them.",
    ),
    it(
        id="seo-tech-directory-grouping",
        category="technical", topic="site_architecture", subtopic="directories",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Directory grouping helps Google learn how often sections change",
        principle=(
            "Google states that if a site has more than a few thousand URLs, how content is organised may affect "
            "crawling and indexing: using directories to group similar topics helps Google learn how often the URLs "
            "in individual directories change, and it can then crawl different directories at different frequencies."
        ),
        explanation=(
            "This is a crawl-efficiency mechanism with an explicit size condition. Below roughly a few thousand URLs "
            "Google presents it as unimportant, so the recommendation should be gated on site size."
        ),
        whyItMatters=(
            "It gives SEO Maker a principled, source-backed threshold for when site-structure advice is worth "
            "raising at all, instead of recommending reorganisation to every site."
        ),
        appliesWhen=[
            "The site has more than a few thousand URLs",
            "Sections of the site change at very different rates, such as policies versus promotions",
            "Auditing a large ecommerce or publisher site",
        ],
        doesNotApplyWhen=[
            "Small sites, where Google explicitly says search engines will likely understand the pages as they are",
            "Recommending a wholesale restructure of an existing site, which Google advises against doing reactively",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["flat URL structure on a large site", "inefficient crawl distribution"],
        checks=["crawl_plan"],
        recommendedAction=(
            "For large sites only, recommend grouping topically similar pages into directories whose change "
            "frequency is consistent. Say plainly that small sites do not need this."
        ),
        applicability=["site_audit", "technical_audit", "url_analysis", "crawl_analysis"],
        limitations=(
            "Google gives no precise URL count and describes the effect on crawl scheduling, not on ranking. It also "
            "warns against dropping everything to reorganise an existing site."
        ),
        relatedKnowledge=["seo-onpage-descriptive-urls", "myth-subdomain-vs-subdirectory"],
        tags=["site_architecture", "crawl_budget", "directories", "large_sites"],
        location="Section: Group topically similar pages in directories",
        quote="If you have more than a few thousand URLs on your site, how you organize your content may have effects on how Google crawls and indexes your site.",
    ),

    # ---------- duplicate content / canonical ----------
    it(
        id="seo-tech-duplicate-content-not-penalty",
        category="technical", topic="duplicate_content", subtopic="penalty",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Duplicate content is inefficient, not a penalty",
        principle=(
            "Google states that having duplicate content on a site is not a violation of its spam policies and will "
            "not cause a manual action, but that it can be a bad user experience and search engines might waste "
            "crawling resources on URLs the owner does not care about. Copying other people's content is treated "
            "differently."
        ),
        explanation=(
            "Duplicate content findings should be framed as crawl waste and user confusion. The word penalty should "
            "not appear, because Google explicitly rules it out for a site's own duplicates."
        ),
        whyItMatters=(
            "The duplicate content penalty is one of the most persistent myths in SEO, and tools reinforce it. "
            "Correct framing changes both the severity and the recommended fix."
        ),
        appliesWhen=[
            "The same content is reachable at multiple URLs on the same site",
            "A user asks whether duplicate content will hurt their rankings",
        ],
        doesNotApplyWhen=[
            "Content scraped or copied from other sites, which Google's scraped-content spam policy does cover",
            "Large-scale duplication produced to manipulate rankings, which falls under scaled content abuse",
        ],
        entities=["page", "site", "content"],
        relatedIssues=["duplicate URLs", "missing canonical", "parameter duplication"],
        checks=["canonical", "indexability"],
        recommendedAction=(
            "Report duplication as wasted crawl and a confusing experience. Recommend a redirect where possible and "
            "rel=canonical where it is not, and state that no penalty is involved."
        ),
        applicability=["canonical_analysis", "technical_audit", "myth_guard", "reporting_language"],
        limitations=(
            "This covers a site's own duplicate URLs. It does not license republishing other sites' content, and it "
            "does not mean duplication has no cost."
        ),
        relatedKnowledge=["seo-tech-redirect-preferred-over-canonical", "myth-duplicate-content-penalty"],
        tags=["duplicate_content", "canonical", "myth_guard", "crawl_budget"],
        location="Section: Reduce duplicate content",
        quote="Having duplicate content on your site is not a violation of our spam policies, but it can be a bad user experience and search engines might waste crawling resources on URLs that you don't even care about.",
    ),
    it(
        id="seo-tech-redirect-preferred-over-canonical",
        category="technical", topic="canonicalization", subtopic="signal_choice",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Prefer a redirect over rel=canonical when consolidating duplicates",
        principle=(
            "Google's starter guide advises that where multiple pages hold the same information, site owners should "
            "try setting up a redirect from the non-preferred URLs to the URL that best represents the information, "
            "and use the rel=canonical link element only if they cannot redirect."
        ),
        explanation=(
            "This gives an explicit ordering for a very common recommendation. Where a duplicate URL serves no "
            "independent purpose, redirecting is the stronger and preferred remedy."
        ),
        whyItMatters=(
            "SEO Maker often detects duplicates without a canonical. Knowing Google's preferred order means the "
            "recommendation can be specific rather than offering two equivalent options."
        ),
        appliesWhen=[
            "Several URLs serve the same content and only one needs to exist",
            "A duplicate cluster has no canonical annotation",
        ],
        doesNotApplyWhen=[
            "The duplicate URL must stay reachable, for example a print view, a tracked campaign URL, or a variant "
            "users navigate to directly",
            "Cross-domain duplication where redirecting would remove a page the other party needs",
        ],
        entities=["page", "site", "technical_configuration"],
        relatedIssues=["duplicate URLs", "missing canonical", "parameter URLs"],
        checks=["canonical", "status", "indexability"],
        recommendedAction=(
            "Recommend a redirect to the preferred URL first; recommend rel=canonical as the fallback when the "
            "duplicate must remain reachable."
        ),
        applicability=["canonical_analysis", "technical_audit", "page_audit"],
        limitations=(
            "Google also notes that if the owner does not canonicalise, it will try to do so automatically, and "
            "advises not to worry too much about this. The advice is about which tool is stronger, not about urgency."
        ),
        relatedKnowledge=["seo-tech-canonical-signal-strength", "seo-tech-duplicate-content-not-penalty"],
        tags=["canonical", "redirects", "duplicate_content"],
        location="Section: Reduce duplicate content",
        quote="If you have multiple pages that have the same information, try setting up a redirect from non-preferred URLs to a URL that best represents that information. If you can't redirect, use the rel=\"canonical\" link element instead.",
    ),

    # ---------- titles / snippets ----------
    it(
        id="seo-onpage-title-quality-criteria",
        category="on_page", topic="title_tag", subtopic="quality_criteria",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="A good title is unique to the page, clear, concise and accurate",
        principle=(
            "Google states that site owners influence title links by writing good titles, and defines a good title "
            "as one that is unique to the page, clear and concise, and accurately describes the contents of the page. "
            "It suggests a title may include the site or business name, the business location, and what the page "
            "offers."
        ),
        explanation=(
            "These four properties - unique, clear, concise, accurate - are the criteria SEO Maker should evaluate "
            "and generate titles against. None of them is a character count."
        ),
        whyItMatters=(
            "It gives title analysis a first-party rubric, replacing the character-count heuristic that dominates "
            "SEO tooling and that Google's own documentation does not support."
        ),
        appliesWhen=[
            "Evaluating an existing title element",
            "Generating a replacement title for a page",
            "A title is duplicated across several pages",
        ],
        doesNotApplyWhen=[
            "Predicting whether Google will rewrite the title, which Google does not publish rules for",
            "Treating any specific length as a pass or fail condition",
        ],
        entities=["page", "content"],
        relatedIssues=["duplicate titles", "vague title", "missing title", "title does not match content"],
        checks=["title"],
        recommendedAction=(
            "Score titles on uniqueness, clarity, concision and accuracy against the page's actual content. Report "
            "length only as truncation risk, never as a rule violation."
        ),
        applicability=["title_generation", "page_audit", "content_analysis"],
        limitations=(
            "Google's title-link documentation states no character limit, and Google may rewrite the title link "
            "regardless of how well the title element is written."
        ),
        relatedKnowledge=["seo-onpage-title-no-official-limit", "seo-qrg-title-part-of-mc", "myth-title-character-limit"],
        tags=["title", "on_page", "content_quality"],
        location="Section: Influence your title links",
        quote="a good title is unique to the page, clear and concise, and accurately describes the contents of the page",
    ),
    it(
        id="seo-onpage-meta-description-criteria",
        category="on_page", topic="meta_description", subtopic="quality_criteria",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="A good meta description is short, unique to one page, and carries the page's key points",
        principle=(
            "Google states that the snippet is sourced from the actual content of the page, that occasionally it may "
            "come from the meta description tag, and that a good meta description is short, unique to one particular "
            "page, and includes the most relevant points of the page."
        ),
        explanation=(
            "Uniqueness and relevance are the criteria. Because the snippet usually comes from page content, a "
            "missing meta description is a missed opportunity rather than a broken page."
        ),
        whyItMatters=(
            "It lets SEO Maker generate and evaluate descriptions against stated criteria, and calibrate the "
            "severity of a missing description correctly."
        ),
        appliesWhen=[
            "A page has no meta description or shares one with other pages",
            "Generating a meta description for a page",
        ],
        doesNotApplyWhen=[
            "Claiming the meta description influences ranking",
            "Enforcing a specific character count as a rule",
        ],
        entities=["page", "content"],
        relatedIssues=["missing meta description", "duplicate meta descriptions"],
        checks=["meta"],
        recommendedAction=(
            "Write a unique description per page covering its most relevant points. Report length only as "
            "truncation risk."
        ),
        applicability=["meta_generation", "page_audit", "content_analysis"],
        limitations=(
            "Because snippets are generated per query and mostly from page content, a written description may be "
            "ignored for most queries. Google publishes no length limit."
        ),
        relatedKnowledge=["seo-onpage-snippet-source", "seo-onpage-meta-description-no-limit", "myth-meta-description-character-limit"],
        tags=["meta_description", "snippet", "on_page"],
        location="Section: Control your snippets",
        quote="A good meta description is short, unique to one particular page, and includes the most relevant points of the page.",
    ),

    # ---------- images / links ----------
    it(
        id="seo-onpage-images-near-relevant-text",
        category="on_page", topic="image_optimization", subtopic="context",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Text near an image helps Google understand what the image means on the page",
        principle=(
            "Google recommends using images that are sharp and clear and placing them near text that is relevant to "
            "the image, stating that the text near images can help Google better understand what the image is about "
            "and what it means in context to the page."
        ),
        explanation=(
            "Image understanding is not carried by the alt attribute alone. Placement relative to related text is a "
            "separate, stated factor, which matters for pages that group all images away from the prose."
        ),
        whyItMatters=(
            "It extends image recommendations beyond alt text, and gives a reason to flag galleries and carousels "
            "that separate images from their explanatory content."
        ),
        appliesWhen=[
            "A page has images placed away from the text that explains them",
            "Auditing image usage on content or product pages",
        ],
        doesNotApplyWhen=[
            "Purely decorative images, which should carry an empty alt attribute and need no surrounding context",
            "Pages where image discovery is irrelevant to the site's goals",
        ],
        entities=["page", "image", "content"],
        relatedIssues=["images detached from relevant text", "poor image context"],
        checks=["images"],
        recommendedAction=(
            "Recommend placing each meaningful image next to the text that describes it, in addition to writing "
            "descriptive alt text."
        ),
        applicability=["image_analysis", "page_audit", "content_analysis"],
        limitations=(
            "Google describes this as helping it understand the image; it does not quantify the effect or promise "
            "image-search visibility."
        ),
        relatedKnowledge=["seo-onpage-alt-text-purpose", "seo-onpage-alt-text-relationship"],
        tags=["images", "context", "image_search"],
        location="Section: Add high-quality images near relevant text",
        quote="The text that's near images can help Google better understand what the image is about and what it means in context to your page.",
    ),
    it(
        id="seo-onpage-alt-text-relationship",
        category="on_page", topic="image_alt_text", subtopic="definition",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Alt text explains the relationship between the image and the page's content",
        principle=(
            "Google describes alt text as a short but descriptive piece of text that explains the relationship "
            "between the image and the content, and states that it helps search engines understand what the image is "
            "about and the context of how it relates to the page."
        ),
        explanation=(
            "The test for good alt text is relational: does it explain what this image is doing on this page. That "
            "is a content judgement, so it belongs to the AI layer rather than the presence-or-absence check."
        ),
        whyItMatters=(
            "It lets SEO Maker move past counting missing alt attributes and assess whether the alt text present is "
            "actually useful."
        ),
        appliesWhen=[
            "Images have alt attributes whose usefulness needs judging",
            "Generating alt text suggestions for meaningful images",
        ],
        doesNotApplyWhen=[
            "Decorative images, which take an empty alt attribute",
            "Deciding alt text from the filename alone, without the page context",
        ],
        entities=["page", "image", "content"],
        relatedIssues=["missing alt text", "unhelpful alt text", "keyword-stuffed alt text"],
        checks=["images"],
        recommendedAction=(
            "Judge alt text on whether it describes the image's role in this page's content, and rewrite it "
            "descriptively rather than inserting target keywords."
        ),
        applicability=["image_analysis", "page_audit"],
        limitations=(
            "Correct alt text depends on the image's role on the page, which an automated check cannot fully "
            "determine. Accessibility, not search, is the primary reason the attribute exists."
        ),
        relatedKnowledge=["seo-onpage-alt-text-purpose", "seo-onpage-alt-text-stuffing", "seo-onpage-images-near-relevant-text"],
        tags=["alt_text", "images", "accessibility"],
        location="Section: Add descriptive alt text to the image",
        quote="Alt text is a short, but descriptive piece of text that explains the relationship between the image and your content.",
    ),
    it(
        id="seo-il-outbound-link-qualification",
        category="internal_linking", topic="outbound_links", subtopic="nofollow",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Qualify links you do not vouch for, and automate that for user-generated content",
        principle=(
            "Google advises that when linking to pages outside your control you should trust the resource, and that "
            "if you cannot trust it but still want to link, you should add a nofollow or similar annotation to avoid "
            "search engines associating your site with it. For user-generated content such as forum posts or "
            "comments, Google says every user-posted link should have such an annotation added automatically by the "
            "CMS."
        ),
        explanation=(
            "This is a site-configuration recommendation with a concrete trigger: any surface that accepts "
            "user-submitted links. Google explicitly ties it to avoiding negative ranking consequences."
        ),
        whyItMatters=(
            "Sites with open comments or forums accumulate untrusted outbound links silently, and the fix is a "
            "template or CMS setting rather than manual clean-up."
        ),
        appliesWhen=[
            "The site accepts user-generated content containing links",
            "A page links out to sites the owner does not control or vouch for",
        ],
        doesNotApplyWhen=[
            "Editorial outbound links to trusted sources, which Google encourages as corroboration",
            "Internal links within the same site",
        ],
        entities=["page", "site", "link"],
        relatedIssues=["unqualified user-generated links", "untrusted outbound links", "comment spam"],
        checks=["links"],
        recommendedAction=(
            "Where the site accepts user-submitted links, recommend automatic nofollow or ugc annotation in the CMS. "
            "For editorial outbound links, recommend annotation only where the destination is not vouched for."
        ),
        applicability=["internal_link_analysis", "site_audit", "spam_risk_analysis"],
        limitations=(
            "Google frames this as avoiding association and potential negative consequences; it does not quantify "
            "the risk. Annotating trusted editorial links is unnecessary."
        ),
        relatedKnowledge=["seo-il-anchor-text-descriptive", "seo-qrg-spammed-comments"],
        tags=["outbound_links", "nofollow", "ugc", "spam_risk"],
        location="Section: Link when you need to",
        quote="If you're accepting user-generated content on your site, such as forum posts or comments, make sure every link that's posted by users has a nofollow or similar annotation automatically added by your CMS.",
    ),

    # ---------- content ----------
    it(
        id="seo-content-starter-quality-attributes",
        category="content", topic="content_quality", subtopic="attributes",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Google names four attributes of compelling and useful content",
        principle=(
            "Google states that creating compelling and useful content will likely influence a site's presence in "
            "search results more than any other suggestion in its starter guide, and lists four shared attributes: "
            "the text is easy to read and well organised; the content is unique; the content is up to date; and the "
            "content is helpful, reliable and people-first."
        ),
        explanation=(
            "These four attributes are a compact, first-party content rubric, and Google ranks content above every "
            "technical suggestion in the same guide. That ordering should inform how SEO Maker prioritises findings."
        ),
        whyItMatters=(
            "It grounds content recommendations in official documentation and supports putting content problems "
            "above minor technical ones when both appear in the same audit."
        ),
        appliesWhen=[
            "Assessing whether a page's content is adequate for its purpose",
            "Ordering a mixed list of content and technical recommendations",
        ],
        doesNotApplyWhen=[
            "Treating these attributes as measurable scores - they are qualitative",
            "Pages whose purpose is transactional or functional rather than informational",
        ],
        entities=["page", "content", "site"],
        relatedIssues=["thin content", "outdated content", "unoriginal content", "poorly structured content"],
        checks=["words", "h1", "h2"],
        recommendedAction=(
            "Assess content against readability and organisation, uniqueness, currency, and helpfulness, and present "
            "content findings above minor technical ones."
        ),
        applicability=["content_analysis", "page_audit", "prioritisation"],
        limitations=(
            "Qualitative attributes with no published measurement. Google says some suggestions may not apply to a "
            "given business."
        ),
        relatedKnowledge=["seo-content-people-first-assessment", "seo-qrg-mc-quality-dimensions"],
        tags=["content_quality", "originality", "freshness", "prioritisation"],
        location="Section: Make your site interesting and useful",
        quote="Creating content that people find compelling and useful will likely influence your website's presence in search results more than any of the other suggestions in this guide.",
    ),
    it(
        id="seo-content-vocabulary-variation",
        category="content", topic="search_intent", subtopic="vocabulary",
        knowledgeType="authoritative", claimType="official_recommendation",
        title="Different audiences use different words, but Google does not need every variant",
        principle=(
            "Google advises anticipating that users with different topic familiarity search differently - its "
            "example is charcuterie versus cheese board - while also stating that site owners should not worry "
            "about anticipating every variation, because Google's language matching systems can understand how a "
            "page relates to many queries even when the exact terms are absent."
        ),
        explanation=(
            "Both halves matter. Vocabulary awareness is useful when it reflects real audience differences; "
            "producing variants to cover phrasings is explicitly unnecessary."
        ),
        whyItMatters=(
            "It separates legitimate audience-vocabulary advice from keyword-variant page generation, which Google "
            "treats elsewhere as scaled content abuse."
        ),
        appliesWhen=[
            "A page's terminology may not match how its audience actually searches",
            "A user asks whether to create pages for query variations",
        ],
        doesNotApplyWhen=[
            "Recommending near-duplicate pages per keyword variant",
            "Any keyword-density or exact-match reasoning",
        ],
        entities=["content", "page", "query"],
        relatedIssues=["terminology mismatch with audience", "keyword-variant page bloat"],
        checks=["none"],
        recommendedAction=(
            "Suggest natural vocabulary that matches the audience, and state explicitly that separate pages for "
            "query variants are not needed and may be treated as scaled content abuse."
        ),
        applicability=["content_analysis", "intent_analysis", "myth_guard"],
        limitations=(
            "Google gives no guidance on how far its language matching extends, so this cannot be used to argue that "
            "wording never matters."
        ),
        relatedKnowledge=["geo-google-no-rewriting-for-ai", "myth-keyword-density", "geo-google-fanout-content-abuse"],
        tags=["vocabulary", "intent", "language_matching", "myth_guard"],
        location="Section: Expect your readers' search terms",
        quote="Google's language matching systems are sophisticated and can understand how your page relates to many queries, even if you don't explicitly use the exact terms in them.",
    ),
    it(
        id="seo-tech-change-latency",
        category="technical", topic="measurement", subtopic="latency",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="SEO changes take hours to months to show up, and not all changes show up at all",
        principle=(
            "Google states that every change takes some time to be reflected, that some changes might take effect in "
            "a few hours while others could take several months, that site owners should generally wait a few weeks "
            "before assessing whether work had beneficial effects, and that not all changes will produce a "
            "noticeable impact in search results."
        ),
        explanation=(
            "This is the expectation-setting SEO Maker should attach to any recommendation it makes, and the reason "
            "it should not promise outcomes or timelines."
        ),
        whyItMatters=(
            "Users interpret an unchanged metric a week after a fix as failure. A first-party statement about "
            "latency prevents both premature conclusions and overpromising in the tool's own language."
        ),
        appliesWhen=[
            "Reporting what a user should expect after applying a recommendation",
            "A user asks how long a fix will take to work",
            "Comparing crawls taken a short time apart",
        ],
        doesNotApplyWhen=[
            "Technical states that are immediately verifiable, such as whether a status code or tag changed",
        ],
        entities=["site", "page"],
        relatedIssues=["no improvement after fix", "premature re-audit"],
        checks=["none"],
        recommendedAction=(
            "Attach an explicit latency caveat to recommendations, and avoid presenting any expected ranking or "
            "traffic outcome or date."
        ),
        applicability=["reporting_language", "prioritisation", "site_audit"],
        limitations=(
            "Google gives ranges rather than commitments and does not say which change types are fast or slow."
        ),
        relatedKnowledge=["geo-google-indexing-not-guaranteed"],
        tags=["expectations", "latency", "reporting_language"],
        location="Section: How long until I see impact in search results?",
        quote="Some changes might take effect in a few hours, others could take several months. In general, you likely want to wait a few weeks to assess whether your work had beneficial effects in Google Search results.",
    ),

    # ---------- the explicit mythbusting section ----------
    it(
        id="myth-meta-keywords-tag",
        category="on_page", topic="meta_keywords", subtopic="ranking",
        knowledgeType="myth", claimType="myth",
        title="Myth: the meta keywords tag affects Google rankings",
        principle=(
            "Claim: populating the keywords meta tag helps a page rank. Reality: Google states plainly that Google "
            "Search does not use the keywords meta tag, and lists it among the things site owners should not focus "
            "on."
        ),
        explanation=(
            "If SEO Maker detects a meta keywords tag, it should be reported as inert - neither a defect nor an "
            "optimisation. Never recommend adding or populating one."
        ),
        whyItMatters=(
            "Legacy CMS templates still emit this tag and legacy audit tools still flag it as missing, which wastes "
            "user effort on a tag with no effect."
        ),
        appliesWhen=[
            "A page contains a keywords meta tag",
            "A user asks whether to fill in meta keywords",
        ],
        doesNotApplyWhen=[
            "Other search engines or internal site-search systems that may use the tag",
        ],
        entities=["page", "technical_configuration"],
        relatedIssues=["meta keywords present", "legacy meta tags"],
        checks=["none"],
        recommendedAction=(
            "State that Google Search does not use this tag. Do not recommend adding, removing or populating it for "
            "Google's sake."
        ),
        applicability=["myth_guard", "page_audit"],
        limitations=(
            "The statement is about Google Search. Some other systems may read the tag, and leaving it in place is "
            "harmless."
        ),
        relatedKnowledge=["myth-keyword-density"],
        tags=["meta_keywords", "myth_guard", "legacy"],
        location="Section: Things we believe you shouldn't focus on",
        quote="Google Search doesn't use the keywords meta tag.",
    ),
    it(
        id="myth-keywords-in-url-rank",
        category="on_page", topic="url_structure", subtopic="ranking",
        knowledgeType="myth", claimType="myth",
        title="Myth: keywords in the domain name or URL path improve rankings",
        principle=(
            "Claim: putting target keywords in the domain or URL path improves ranking. Reality: Google states that "
            "from a ranking perspective the keywords in the domain name or URL path alone have hardly any effect "
            "beyond appearing in breadcrumbs, and recommends choosing a site name by general marketing best "
            "practices."
        ),
        explanation=(
            "URL readability should be recommended for user comprehension and breadcrumb display only. Exact-match "
            "domains and keyword-stuffed slugs are not ranking improvements."
        ),
        whyItMatters=(
            "URL rewrites are expensive and risky. Recommending them for a ranking benefit Google says is negligible "
            "trades real redirect risk for nothing."
        ),
        appliesWhen=[
            "A user asks about exact-match domains or keyword-rich slugs",
            "Considering whether to rewrite existing URLs",
        ],
        doesNotApplyWhen=[
            "Recommending readable URLs for new pages, where the user-facing benefit still stands",
        ],
        entities=["page", "site"],
        relatedIssues=["proposed URL rewrite for keywords", "exact-match domain question"],
        checks=["none"],
        recommendedAction=(
            "Recommend descriptive URLs for user clarity, and say explicitly that keyword placement in the URL is "
            "not a meaningful ranking lever."
        ),
        applicability=["myth_guard", "url_analysis", "site_audit"],
        limitations=(
            "Google says hardly any effect rather than none, and URL words do appear in breadcrumbs, which has a "
            "genuine user-facing value."
        ),
        relatedKnowledge=["seo-onpage-descriptive-urls", "myth-tld-affects-ranking"],
        tags=["urls", "domains", "myth_guard"],
        location="Section: Things we believe you shouldn't focus on - Keywords in the domain name or URL path",
        quote="From a ranking perspective, the keywords in the name of the domain (or URL path) alone have hardly any effect beyond appearing in breadcrumbs.",
    ),
    it(
        id="myth-tld-affects-ranking",
        category="technical", topic="domains", subtopic="tld",
        knowledgeType="myth", claimType="myth",
        title="Myth: the TLD affects how Google ranks a site",
        principle=(
            "Claim: some top-level domains rank better than others. Reality: Google states the TLD only matters if "
            "you are targeting a specific country's users, and even then it is usually a low impact signal; "
            "otherwise Google Search does not care which TLD is used."
        ),
        explanation=(
            "Domain extension is a business and country-targeting decision. SEO Maker should not raise a site's TLD "
            "as a ranking concern."
        ),
        whyItMatters=(
            "Domain migrations are among the riskiest changes a site can make, and TLD-based ranking claims are a "
            "common reason they get proposed."
        ),
        appliesWhen=[
            "A user asks whether to move to a different TLD for SEO reasons",
            "Auditing a site on a newer or less common TLD",
        ],
        doesNotApplyWhen=[
            "Genuine single-country targeting, where a country-code TLD does carry a documented, low-impact signal",
        ],
        entities=["site", "business"],
        relatedIssues=["proposed domain migration", "TLD concerns"],
        checks=["none"],
        recommendedAction=(
            "Do not recommend a TLD change for ranking. Discuss country-code TLDs only in an explicit "
            "country-targeting context, and note the impact is low."
        ),
        applicability=["myth_guard", "site_audit", "international_analysis"],
        limitations=(
            "Country-code TLDs do carry a geotargeting signal that Google describes as usually low impact, so the "
            "answer is not a flat no in an international context."
        ),
        relatedKnowledge=["myth-keywords-in-url-rank", "seo-intl-hreflang-return-links"],
        tags=["tld", "domains", "geotargeting", "myth_guard"],
        location="Section: Things we believe you shouldn't focus on - Keywords in the domain name or URL path",
        quote="the TLD (the domain name ending like \".com\" or \".guru\") only matters if you're targeting a specific country's users, and even then it's usually a low impact signal.",
    ),
    it(
        id="myth-heading-order-and-count",
        category="on_page", topic="headings", subtopic="order_and_count",
        knowledgeType="myth", claimType="myth",
        title="Myth: Google requires one H1 and a strict heading order",
        principle=(
            "Claim: a page must have exactly one H1 and headings must descend without skipping levels for Google. "
            "Reality: Google states that having headings in semantic order is fantastic for screen readers, but from "
            "a Google Search perspective it does not matter if they are used out of order, and that there is no "
            "magical, ideal amount of headings a page should have - though if you think it is too much, it probably "
            "is."
        ),
        explanation=(
            "Heading findings should be framed as accessibility and reader clarity, which is where Google locates "
            "the benefit, not as a Google Search requirement. A missing or duplicated H1 is not a ranking defect."
        ),
        whyItMatters=(
            "The single-H1 rule is one of the most widely enforced fictions in SEO tooling, and SEO Maker's own "
            "deterministic layer includes an h1 check whose wording the AI layer must not escalate into a Google rule."
        ),
        appliesWhen=[
            "A page has zero, multiple, or out-of-order headings",
            "Reporting the result of an h1 or h2 check",
            "A user asks how many H1s a page should have",
        ],
        doesNotApplyWhen=[
            "Accessibility reviews, where semantic heading order genuinely matters for assistive technology",
            "Pages where headings are so sparse that readers cannot navigate the content, which is a real usability "
            "problem",
        ],
        entities=["page", "content"],
        relatedIssues=["missing H1", "multiple H1", "skipped heading levels", "no H2"],
        checks=["h1", "h2"],
        recommendedAction=(
            "Report heading structure as a readability and accessibility matter. Do not describe a missing or "
            "duplicated H1 as a Google Search requirement or a ranking problem."
        ),
        applicability=["myth_guard", "heading_analysis", "page_audit", "reporting_language"],
        limitations=(
            "Google's statement concerns order and count. Headings still matter for users and assistive technology, "
            "and Google separately recommends headings that give clear structure to content."
        ),
        relatedKnowledge=["seo-onpage-heading-structure", "geo-google-organize-content-for-readers"],
        tags=["headings", "h1", "accessibility", "myth_guard"],
        location="Section: Things we believe you shouldn't focus on - Number and order of headings",
        quote="Having your headings in semantic order is fantastic for screen readers, but from Google Search perspective, it doesn't matter if you're using them out of order. [...] There's also no magical, ideal amount of headings a given page should have.",
    ),
    it(
        id="myth-eeat-is-a-ranking-factor",
        category="content", topic="eeat", subtopic="ranking_factor",
        knowledgeType="myth", claimType="myth",
        title="Myth: E-E-A-T is a ranking factor",
        principle=(
            "Claim: E-E-A-T is a ranking factor that can be measured and optimised. Reality: Google's starter guide "
            "lists \"Thinking E-E-A-T is a ranking factor\" under things not to focus on and answers \"No, it's not\"; "
            "the helpful-content guidance states that while E-E-A-T itself is not a specific ranking factor, Google "
            "uses a mix of factors that can identify content with good E-E-A-T."
        ),
        explanation=(
            "E-E-A-T is a vocabulary for discussing credibility, not a score. SEO Maker may use it to explain a "
            "content-credibility recommendation but must never present it as a measurable factor or report an "
            "E-E-A-T score."
        ),
        whyItMatters=(
            "Selling an E-E-A-T score is a common tooling overreach. Two separate Google documents contradict it "
            "directly, which makes this one of the safest corrections the AI layer can make."
        ),
        appliesWhen=[
            "A user asks how to improve or measure their E-E-A-T",
            "Explaining content credibility recommendations",
            "A third-party report has assigned the site an E-E-A-T score",
        ],
        doesNotApplyWhen=[
            "Discussing the concrete practices E-E-A-T describes - authorship, sourcing, first-hand experience - "
            "which Google does encourage",
        ],
        entities=["content", "site", "page"],
        relatedIssues=["E-E-A-T score claims", "credibility recommendations"],
        checks=["none"],
        recommendedAction=(
            "Use E-E-A-T as explanatory vocabulary only. Recommend the underlying practices, and state that Google "
            "says E-E-A-T is not itself a ranking factor."
        ),
        applicability=["myth_guard", "content_analysis", "reporting_language"],
        limitations=(
            "Google does say it uses a mix of factors that identify content with good E-E-A-T, and gives such "
            "content more weight on YMYL topics - so the underlying concepts are not irrelevant."
        ),
        relatedKnowledge=["seo-content-eeat-framework", "seo-content-eeat-trust-central", "seo-content-ymyl"],
        tags=["eeat", "myth_guard", "content_quality"],
        location="Section: Things we believe you shouldn't focus on - Thinking E-E-A-T is a ranking factor",
        quote="Thinking E-E-A-T is a ranking factor. No, it's not.",
    ),
    it(
        id="myth-duplicate-content-penalty",
        category="technical", topic="duplicate_content", subtopic="penalty",
        knowledgeType="myth", claimType="myth",
        title="Myth: duplicate content triggers a penalty",
        principle=(
            "Claim: duplicate content on a site causes a ranking penalty. Reality: Google states that content "
            "accessible under multiple URLs is fine, that it is inefficient but not something that will cause a "
            "manual action, and that copying other people's content is a different matter."
        ),
        explanation=(
            "Report duplication in terms of crawl waste and user confusion. The correct fix is consolidation, and "
            "the correct urgency is low unless the duplication is large enough to affect crawl coverage."
        ),
        whyItMatters=(
            "Overstated duplicate-content warnings push users into unnecessary and sometimes damaging canonical or "
            "redirect changes."
        ),
        appliesWhen=[
            "The same content is reachable at several URLs on one site",
            "A user asks whether duplicate content will get them penalised",
        ],
        doesNotApplyWhen=[
            "Content copied from other sites, which Google's scraped-content policy does address",
            "Mass-generated near-duplicate pages, which fall under scaled content abuse",
        ],
        entities=["page", "site", "content"],
        relatedIssues=["duplicate URLs", "duplicate content warnings"],
        checks=["canonical", "indexability"],
        recommendedAction=(
            "Say plainly that there is no duplicate content penalty for a site's own duplicates, then recommend "
            "consolidation for crawl efficiency and clarity."
        ),
        applicability=["myth_guard", "canonical_analysis", "reporting_language"],
        limitations=(
            "Inefficiency is real: duplication wastes crawl resources and can leave the wrong URL indexed. Copied "
            "third-party content is a separate and genuine risk."
        ),
        relatedKnowledge=["seo-tech-duplicate-content-not-penalty", "seo-qrg-scaled-content-abuse"],
        tags=["duplicate_content", "myth_guard", "penalty"],
        location="Section: Things we believe you shouldn't focus on - Duplicate content \"penalty\"",
        quote="If you have some content that's accessible under multiple URLs, it's fine; don't fret about it. It's inefficient, but it's not something that will cause a manual action.",
    ),
    it(
        id="myth-subdomain-vs-subdirectory",
        category="technical", topic="site_architecture", subtopic="subdomains",
        knowledgeType="myth", claimType="myth",
        title="Myth: subdirectories beat subdomains for SEO",
        principle=(
            "Claim: content must live in subdirectories rather than subdomains to perform in search. Reality: Google "
            "says to do whatever makes sense for your business - it may be easier to manage a site segmented by "
            "subdirectories, and other times it may make sense to partition topics into subdomains."
        ),
        explanation=(
            "This is an operational choice, not an SEO rule. A subdomain migration proposed purely for ranking has "
            "no first-party support and carries real migration risk."
        ),
        whyItMatters=(
            "Subdomain-to-subdirectory migrations are expensive, disruptive, and frequently recommended on the "
            "strength of this myth alone."
        ),
        appliesWhen=[
            "A site uses subdomains for blog, docs, shop or similar sections",
            "A user asks whether to migrate a subdomain into a subdirectory",
        ],
        doesNotApplyWhen=[
            "Cases with a concrete operational reason to consolidate, such as shared templates or analytics",
        ],
        entities=["site", "business", "technical_configuration"],
        relatedIssues=["subdomain architecture question", "proposed migration"],
        checks=["none"],
        recommendedAction=(
            "Present the choice as operational. Do not recommend a migration on ranking grounds, and note that each "
            "subdomain needs its own robots.txt and sitemap handling."
        ),
        applicability=["myth_guard", "site_audit", "technical_audit"],
        limitations=(
            "Subdomains do have practical consequences for robots.txt scope, sitemap organisation and analytics, "
            "which are legitimate reasons to prefer one arrangement."
        ),
        relatedKnowledge=["seo-tech-directory-grouping", "seo-tech-robots-file-requirements"],
        tags=["subdomains", "site_architecture", "myth_guard"],
        location="Section: Things we believe you shouldn't focus on - Subdomains versus subdirectories",
        quote="From a business point of view, do whatever makes sense for your business.",
    ),
    it(
        id="myth-pagerank-is-everything",
        category="technical", topic="ranking_systems", subtopic="pagerank",
        knowledgeType="myth", claimType="myth",
        title="Myth: links and PageRank are what Google ranking comes down to",
        principle=(
            "Claim: rankings are essentially a function of links. Reality: Google states that while PageRank uses "
            "links and is one of its fundamental algorithms, there is much more to Google Search than just links, "
            "and that it has many ranking signals of which PageRank is just one."
        ),
        explanation=(
            "Link-centric explanations should not be offered as the default reason a page underperforms, especially "
            "when SEO Maker has direct evidence of content, intent or technical problems."
        ),
        whyItMatters=(
            "Link-only diagnoses send users toward link acquisition when the observable problem is usually "
            "something the tool can actually see and fix."
        ),
        appliesWhen=[
            "A user attributes an underperforming page solely to backlinks",
            "Explaining why a technically sound page may still not rank",
        ],
        doesNotApplyWhen=[
            "Claiming links do not matter - Google calls PageRank one of its fundamental algorithms",
        ],
        entities=["site", "page", "link"],
        relatedIssues=["link-only diagnosis", "backlink fixation"],
        checks=["none"],
        recommendedAction=(
            "Acknowledge links as one signal among many, and direct the user to the concrete issues the crawl "
            "actually found."
        ),
        applicability=["myth_guard", "site_audit", "reporting_language"],
        limitations=(
            "Google confirms PageRank is real and fundamental; this item counters over-attribution, not the "
            "existence of link-based signals."
        ),
        relatedKnowledge=["myth-domain-authority-ranking-factor", "seo-il-internal-links-discovery"],
        tags=["pagerank", "links", "ranking_signals", "myth_guard"],
        location="Section: Things we believe you shouldn't focus on - PageRank",
        quote="While PageRank uses links and is one of the fundamental algorithms at Google, there's much more to Google Search than just links. We have many ranking signals, and PageRank is just one of those.",
    ),
    it(
        id="seo-content-no-word-count-target-starter",
        category="content", topic="content_length", subtopic="word_count",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Content length alone does not matter for ranking",
        principle=(
            "Google states that the length of the content alone does not matter for ranking purposes, that there is "
            "no magical word count target, minimum or maximum, and adds only that you probably want to have at "
            "least one word."
        ),
        explanation=(
            "Word count is usable as evidence that a page may be too thin to serve its purpose, but never as a "
            "target. SEO Maker's own thin-content threshold is a heuristic and must be described as one."
        ),
        whyItMatters=(
            "SEO Maker's deterministic layer applies a word threshold. This item is what stops the AI layer "
            "presenting that internal threshold as a Google requirement."
        ),
        appliesWhen=[
            "Reporting the result of a word-count check",
            "A user asks how long their content should be",
            "Deciding how to phrase a thin-content finding",
        ],
        doesNotApplyWhen=[
            "Pages that genuinely fail to answer the query, where thinness is a real problem regardless of count",
        ],
        entities=["page", "content"],
        relatedIssues=["thin content", "word count below threshold"],
        checks=["words"],
        recommendedAction=(
            "Phrase thin-content findings as \"this page may not cover its topic fully\" and name what is missing, "
            "rather than \"this page is under N words\". Never recommend padding to a number."
        ),
        applicability=["content_analysis", "myth_guard", "page_audit", "reporting_language"],
        limitations=(
            "Genuinely thin pages that fail to answer the query remain a real problem. Google also notes that "
            "varying wording naturally gives more chances to show up, which is about vocabulary, not length."
        ),
        relatedKnowledge=["seo-content-no-ideal-word-count", "myth-more-words-rank-better", "seo-content-no-preferred-word-count"],
        tags=["word_count", "content_length", "thin_content", "myth_guard"],
        location="Section: Things we believe you shouldn't focus on - Minimum or maximum content length",
        quote="The length of the content alone doesn't matter for ranking purposes (there's no magical word count target, minimum or maximum, though you probably want to have at least one word).",
    ),
    it(
        id="seo-sd-eligibility-for-features-starter",
        category="structured_data", topic="rich_results", subtopic="eligibility",
        knowledgeType="authoritative", claimType="documented_behavior",
        title="Valid structured data makes pages eligible for special search features",
        principle=(
            "Google states that valid structured data on a page makes the page eligible for many special features in "
            "Google Search results, including review stars and carousels, and points to a gallery of result types a "
            "page can be eligible for."
        ),
        explanation=(
            "Eligibility is the correct word in every structured data recommendation. Adding markup does not produce "
            "a rich result; it makes one possible."
        ),
        whyItMatters=(
            "Promising rich results after adding markup is one of the most common ways SEO tools mislead users, and "
            "the correction is a single word."
        ),
        appliesWhen=[
            "A page has no structured data and could qualify for a supported feature",
            "Explaining the benefit of adding or fixing markup",
        ],
        doesNotApplyWhen=[
            "Promising that a rich result will appear",
            "Claiming structured data improves ranking",
        ],
        entities=["page", "structured_data"],
        relatedIssues=["missing structured data", "invalid structured data"],
        checks=["schema"],
        recommendedAction=(
            "Describe structured data as creating eligibility for named features, and say that display remains "
            "Google's decision and varies by query."
        ),
        applicability=["structured_data_analysis", "page_audit", "myth_guard"],
        limitations=(
            "Feature availability changes over time and some feature types have been narrowed or retired. Google "
            "separately states structured data is not required for its generative AI features."
        ),
        relatedKnowledge=["seo-sd-eligibility-not-guarantee", "myth-schema-guarantees-rich-results", "geo-google-structured-data-optional"],
        tags=["structured_data", "rich_results", "eligibility"],
        location="Section: Next steps - Enhance how your site looks in Google Search results",
        quote="Valid structured data on your pages also makes your pages eligible for many special features in Google Search results, including review stars, carousels, and more.",
    ),
]
