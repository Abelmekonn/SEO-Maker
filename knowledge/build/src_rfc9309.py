# -*- coding: utf-8 -*-
"""Knowledge extracted from RFC 9309 (Robots Exclusion Protocol), September 2022."""

from common import item, RFC9309

S = RFC9309
COMMON = dict(
    domain="seo", category="technical", topic="robots_txt",
    knowledgeType="authoritative", source=S,
    evidenceType="standard", evidenceStrength="strong", confidence="high",
    version="RFC 9309 (September 2022)", reviewBy="2027-09-22",
)

def it(**kw):
    return item(**{**COMMON, **kw})


ITEMS = [
    it(
        id="seo-tech-robots-standardised",
        subtopic="protocol_status",
        claimType="specification_rule",
        title="robots.txt is defined by a ratified IETF standard, so syntax defects are objectively checkable",
        principle=(
            "The Robots Exclusion Protocol is an IETF Standards Track document (RFC 9309, September 2022) that "
            "specifies the robots.txt file's formal ABNF syntax, user-agent group matching, allow/disallow path "
            "matching, error handling, and caching behaviour."
        ),
        explanation=(
            "Because the grammar and the matching algorithm are normative, a robots.txt finding can be reported as a "
            "standards violation with a citation rather than as a stylistic preference. SEO Maker's robots parser can "
            "compare a site's file against the specification and report concrete, defensible defects."
        ),
        whyItMatters=(
            "It separates objective robots.txt defects (which the standard settles) from crawler-specific behaviour "
            "(which it does not), so recommendations do not overstate what is guaranteed."
        ),
        appliesWhen=[
            "Auditing the syntax and structure of a site's /robots.txt",
            "Explaining why a robots.txt construct is or is not valid",
        ],
        doesNotApplyWhen=[
            "Predicting whether a URL will be indexed - the standard governs crawling only",
            "Reasoning about crawlers that do not implement RFC 9309, since compliance is voluntary",
            "Reasoning about vendor extensions such as crawl-delay or wildcard behaviour beyond the specified set",
        ],
        entities=["site", "technical_configuration", "crawler"],
        relatedIssues=["robots.txt syntax errors", "robots.txt not parsed as expected"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Report robots.txt defects against the RFC 9309 grammar and cite the relevant section, rather than "
            "describing them as best-practice deviations."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis", "reporting_language"],
        limitations=(
            "The standard describes crawler behaviour only. It makes no claim about indexing, ranking, or how any "
            "individual search engine weights a disallowed URL, and compliance is voluntary for non-cooperative bots."
        ),
        relatedKnowledge=["seo-tech-robots-not-access-control", "seo-tech-robots-file-requirements"],
        tags=["robots.txt", "standard", "rfc9309", "crawling"],
        location="Abstract; Section 2 (Specification)",
        quote="This document specifies and extends the \"Robots Exclusion Protocol\" method originally defined by Martijn Koster in 1994 [...] Specifically, it adds definition language for the protocol, instructions for handling errors, and instructions for caching.",
    ),
    it(
        id="seo-tech-robots-4xx-unavailable",
        subtopic="error_handling",
        claimType="specification_rule",
        title="A 4xx on robots.txt means no restrictions apply",
        principle=(
            "RFC 9309 Section 2.3.1.3 defines a robots.txt that returns an unavailable status (in HTTP, the 400-499 "
            "range) as \"unavailable\", and states that the crawler MAY then access any resources on the server."
        ),
        explanation=(
            "A missing robots.txt is therefore a non-event for crawling: the site is fully crawlable by default. "
            "SEO Maker should not report a 404 on robots.txt as a crawl-blocking problem."
        ),
        whyItMatters=(
            "It stops the tool raising a false alarm on the most common robots.txt state - absent - and keeps "
            "severity available for the 5xx case, which genuinely does suppress crawling."
        ),
        appliesWhen=[
            "The crawl receives a 4xx response when fetching /robots.txt",
            "Deciding the severity of a missing robots.txt finding",
        ],
        doesNotApplyWhen=[
            "The response is 429, which signals rate limiting rather than a permanently unavailable file",
            "The response is 5xx or the host is unreachable - a different and stricter rule applies",
        ],
        entities=["site", "technical_configuration", "crawler"],
        relatedIssues=["robots.txt returns 404", "robots.txt missing"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Treat a 4xx robots.txt as informational. Suggest publishing one only when the site actually needs "
            "crawl rules or wants to declare a sitemap, not as a defect to fix."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis", "prioritisation"],
        limitations=(
            "The standard permits full access but does not require it; a specific crawler may still apply its own "
            "conservative policy. It also says nothing about indexing consequences."
        ),
        relatedKnowledge=["seo-tech-robots-5xx-disallow", "seo-tech-robots-standardised"],
        tags=["robots.txt", "http_status", "404", "crawling"],
        location="Section 2.3.1.3 (\"Unavailable\" Status), page 8",
        quote="If a server status code indicates that the robots.txt file is unavailable to the crawler, then the crawler MAY access any resources on the server.",
    ),
    it(
        id="seo-tech-robots-5xx-disallow",
        subtopic="error_handling",
        claimType="specification_rule",
        title="A 5xx or unreachable robots.txt means crawlers must assume complete disallow",
        principle=(
            "RFC 9309 Section 2.3.1.4 states that if robots.txt is unreachable due to server or network errors "
            "(in HTTP, the 500-599 range), the file is undefined and the crawler MUST assume complete disallow. "
            "If it stays undefined for a reasonably long period - the standard gives 30 days as an example - "
            "crawlers MAY then treat it as unavailable or keep using a cached copy."
        ),
        explanation=(
            "A server error on this single file can suppress crawling of an entire site, which makes it far more "
            "serious than a 404 on the same file. The 30-day allowance is a ceiling on the damage, not a reason to "
            "downgrade the finding."
        ),
        whyItMatters=(
            "This is one of the few single-file failures that can take a whole site out of crawl. It deserves the "
            "highest technical severity SEO Maker can assign, and it is fully deterministic to detect."
        ),
        appliesWhen=[
            "The crawl receives a 5xx response when fetching /robots.txt",
            "The robots.txt host is unreachable due to DNS, TLS, or network failure",
            "Site-wide crawl or indexing volume has dropped and robots.txt availability has not been ruled out",
        ],
        doesNotApplyWhen=[
            "The response is 4xx, which the standard treats as no restrictions",
            "The error is transient and the file has since returned 200 - report it as history, not a live defect",
        ],
        entities=["site", "technical_configuration", "crawler"],
        relatedIssues=["robots.txt returns 5xx", "site-wide crawl suppression", "robots.txt unreachable"],
        checks=["robots", "robots_audit", "crawl_plan"],
        recommendedAction=(
            "Escalate as a critical availability incident: make /robots.txt return 200 or 404, never 5xx. A static "
            "file or edge rule that cannot depend on the application backend is the usual fix."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis", "prioritisation"],
        limitations=(
            "Exact retry windows, cache retention, and the point at which a crawler relaxes the assumption vary by "
            "implementation; the 30-day figure is an example in the standard, not a required threshold."
        ),
        relatedKnowledge=["seo-tech-robots-4xx-unavailable", "seo-tech-robots-cache-24h"],
        tags=["robots.txt", "http_status", "5xx", "crawl_suppression", "critical"],
        location="Section 2.3.1.4 (\"Unreachable\" Status), page 8",
        quote="If the robots.txt file is unreachable due to server or network errors, this means the robots.txt file is undefined and the crawler MUST assume complete disallow.",
    ),
    it(
        id="seo-tech-robots-not-access-control",
        subtopic="security",
        claimType="specification_rule",
        title="robots.txt is not access control, and listing a path exposes it",
        principle=(
            "RFC 9309 states that the rules are not a form of access authorization, and its Security Considerations "
            "section notes that listing paths in robots.txt exposes them publicly and thus makes them discoverable. "
            "Controlling access requires a real application-layer measure such as HTTP authentication."
        ),
        explanation=(
            "Disallowing a path advertises that the path exists. When SEO Maker sees sensitive-looking paths in "
            "robots.txt - admin areas, staging hosts, internal exports - the correct advice is authentication or "
            "removal, never a tighter disallow rule."
        ),
        whyItMatters=(
            "Recommending robots.txt as a way to hide content is actively harmful advice, and it is a common "
            "misconception among site owners."
        ),
        appliesWhen=[
            "robots.txt contains paths that look private, administrative, or pre-production",
            "A user asks how to keep a page out of search or away from the public",
        ],
        doesNotApplyWhen=[
            "The goal is genuinely crawl budget management on public URLs, where disallow is the right tool",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["sensitive paths disclosed in robots.txt", "robots.txt used as a privacy control"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Where a disallowed path looks sensitive, recommend authentication or removal of the resource, and note "
            "that the robots.txt entry itself discloses the path."
        ),
        applicability=["technical_audit", "site_audit", "myth_guard", "reporting_language"],
        limitations=(
            "This is a statement about the protocol's guarantees, not a vulnerability assessment. SEO Maker cannot "
            "confirm from a crawl whether a disallowed path is actually sensitive or actually unprotected."
        ),
        relatedKnowledge=["seo-tech-robots-standardised"],
        tags=["robots.txt", "security", "disclosure", "myth_guard"],
        location="Section 1 (Introduction) and Section 3 (Security Considerations), pages 3 and 9",
        quote="The Robots Exclusion Protocol is not a substitute for valid content security measures. Listing paths in the robots.txt file exposes them publicly and thus makes the paths discoverable.",
    ),
    it(
        id="seo-tech-robots-file-requirements",
        subtopic="file_location",
        claimType="specification_rule",
        title="robots.txt must be at the top-level path, lowercase, UTF-8 and text/plain",
        principle=(
            "RFC 9309 Section 2.3 requires the rules to be accessible in a file named \"/robots.txt\" (all lowercase) "
            "in the top-level path of the service, encoded as UTF-8 and served with the media type text/plain."
        ),
        explanation=(
            "Each of these is a deterministic check with an unambiguous fix. A rules file at a subdirectory path, "
            "served as text/html, or in a non-UTF-8 encoding is not a valid robots.txt regardless of its contents."
        ),
        whyItMatters=(
            "A robots.txt that is never read is indistinguishable from one that does not exist, so an otherwise "
            "correct rules file can be silently ineffective."
        ),
        appliesWhen=[
            "Validating how a site serves its robots.txt",
            "A site reports that its robots.txt rules are being ignored",
        ],
        doesNotApplyWhen=[
            "Evaluating the rules themselves rather than how the file is served",
            "Per-protocol or per-host variants, where each scheme and authority has its own robots.txt",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["robots.txt served with wrong content type", "robots.txt not at site root"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Serve the file at the scheme-and-authority root as text/plain in UTF-8. Note that each host and scheme "
            "needs its own file."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis"],
        limitations=(
            "Crawlers may be lenient in practice - some accept other content types - but leniency is not guaranteed "
            "by the standard and should not be relied on."
        ),
        relatedKnowledge=["seo-tech-robots-standardised", "seo-tech-robots-redirect-limit"],
        tags=["robots.txt", "encoding", "content_type", "file_location"],
        location="Section 2.3 (Access Method), page 7",
        quote="The rules MUST be accessible in a file named \"/robots.txt\" (all lowercase) in the top-level path of the service. The file MUST be UTF-8 encoded [...] and Internet Media Type \"text/plain\".",
    ),
    it(
        id="seo-tech-robots-most-specific-match",
        subtopic="rule_matching",
        claimType="specification_rule",
        title="The most specific robots.txt rule wins, measured in octets, and allow breaks ties",
        principle=(
            "RFC 9309 Section 2.2.2 requires that the most specific match be used, defines the most specific match as "
            "the one with the most octets, and states that where an allow rule and a disallow rule are equivalent the "
            "allow rule SHOULD be used. If no rule in the matching group matches, the URI is allowed, and /robots.txt "
            "itself is implicitly allowed."
        ),
        explanation=(
            "Rule order in the file does not decide the outcome; rule length does. This is the single most "
            "misunderstood part of robots.txt, and it means a long Allow can legitimately override a short Disallow."
        ),
        whyItMatters=(
            "Site owners frequently believe a later or earlier rule wins, and then either over-block or wrongly "
            "believe a path is blocked. Getting this right is what makes a blocked-URL explanation trustworthy."
        ),
        appliesWhen=[
            "Explaining why a specific URL is or is not blocked by robots.txt",
            "A site has overlapping Allow and Disallow rules for the same path prefix",
        ],
        doesNotApplyWhen=[
            "The user-agent group has not been resolved yet - group selection happens first",
            "Reasoning about crawlers with non-standard matching behaviour",
        ],
        entities=["site", "technical_configuration", "crawler"],
        relatedIssues=["unexpected robots.txt blocking", "Allow rule not taking effect"],
        checks=["robots", "robots_audit", "indexability"],
        recommendedAction=(
            "When explaining a blocked URL, name the exact winning rule and its length rather than quoting the whole "
            "file. When a path must be opened, add an Allow rule longer than the competing Disallow."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis", "indexability_analysis"],
        limitations=(
            "Path matching SHOULD be case sensitive and must start at the first octet, and percent-encoding is "
            "normalised before comparison - so naive string comparison can disagree with the specification."
        ),
        relatedKnowledge=["seo-tech-robots-group-selection", "seo-tech-robots-special-characters"],
        tags=["robots.txt", "rule_matching", "allow", "disallow", "precedence"],
        location="Section 2.2.2 (The \"Allow\" and \"Disallow\" Lines), page 6; Section 5.2 (Longest Match), page 10",
        quote="The most specific match found MUST be used. The most specific match is the match that has the most octets. [...] If an \"allow\" rule and a \"disallow\" rule are equivalent, then the \"allow\" rule SHOULD be used.",
    ),
    it(
        id="seo-tech-robots-group-selection",
        subtopic="rule_matching",
        claimType="specification_rule",
        title="Crawlers match one user-agent group, merging duplicates and falling back to the wildcard",
        principle=(
            "RFC 9309 Section 2.2.1 requires case-insensitive matching of the product token; where several groups "
            "match the same token their rules MUST be combined into one group; if no group matches, the crawler MUST "
            "obey the group with the \"*\" user-agent if one is present; and if neither exists, no rules apply."
        ),
        explanation=(
            "A crawler obeys exactly one effective group. Rules written for a different user agent never apply, which "
            "is why a site can have a large Disallow list and still be fully crawlable by a given bot."
        ),
        whyItMatters=(
            "Reporting every Disallow line in a file as though it applied to Googlebot is a common and misleading "
            "tool behaviour. Group resolution has to happen before any blocking claim is made."
        ),
        appliesWhen=[
            "A robots.txt contains multiple user-agent groups",
            "Explaining which robots.txt rules actually govern a particular crawler",
        ],
        doesNotApplyWhen=[
            "Only one group exists and it is the wildcard group",
            "Reasoning about crawlers that deliberately ignore robots.txt",
        ],
        entities=["site", "technical_configuration", "crawler"],
        relatedIssues=["rules attributed to the wrong user agent", "wildcard group ignored"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Resolve the applicable group for the named crawler first, then report only that group's rules. State "
            "explicitly which user-agent group the finding applies to."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis", "reporting_language"],
        limitations=(
            "The standard does not define behaviour for a crawler operating several product tokens, and search "
            "engines may run multiple distinct crawlers whose groups differ."
        ),
        relatedKnowledge=["seo-tech-robots-most-specific-match"],
        tags=["robots.txt", "user_agent", "group_matching"],
        location="Section 2.2.1 (The User-Agent Line), pages 4-5",
        quote="If no matching group exists, crawlers MUST obey the group with a user-agent line with the \"*\" value, if present.",
    ),
    it(
        id="seo-tech-robots-special-characters",
        subtopic="rule_matching",
        claimType="specification_rule",
        title="Crawlers must support #, $ and * in robots.txt rules",
        principle=(
            "RFC 9309 Section 2.2.3 requires crawlers to support three special characters: \"#\" designating a line "
            "comment, \"$\" designating the end of the match pattern, and \"*\" designating zero or more instances of "
            "any character. To match these characters literally in a URI, crawlers SHOULD use percent-encoding."
        ),
        explanation=(
            "Wildcard and end-anchor support is normative, not a Google extension, so patterns using them can be "
            "validated and explained with confidence. A rule intending to match a literal asterisk or dollar sign "
            "must percent-encode it."
        ),
        whyItMatters=(
            "Wildcards are where robots.txt rules most often over-match and block more than intended, and SEO Maker "
            "can only explain that if it models the same semantics the standard defines."
        ),
        appliesWhen=[
            "A robots.txt rule uses * or $",
            "Explaining why a rule matched a broader set of URLs than the author expected",
        ],
        doesNotApplyWhen=[
            "Non-conforming crawlers that treat wildcards literally",
            "Other robots.txt fields such as Sitemap, which are outside the allow/disallow grammar",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["overly broad wildcard disallow", "robots.txt pattern over-matching"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Expand wildcard rules against the crawled URL set and show which URLs a pattern actually matches, "
            "rather than reporting the pattern alone."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis"],
        limitations=(
            "The specification defines only these three characters. Any richer pattern syntax is a vendor extension "
            "with no standard guarantee."
        ),
        relatedKnowledge=["seo-tech-robots-most-specific-match"],
        tags=["robots.txt", "wildcard", "pattern_matching"],
        location="Section 2.2.3 (Special Characters), page 6",
        quote="Crawlers MUST support the following special characters: # [...] $ [...] *",
    ),
    it(
        id="seo-tech-robots-cache-24h",
        subtopic="caching",
        claimType="specification_rule",
        title="robots.txt changes can take about a day to take effect",
        principle=(
            "RFC 9309 Section 2.4 permits crawlers to cache robots.txt and states they SHOULD NOT use a cached "
            "version for more than 24 hours, unless the file is unreachable."
        ),
        explanation=(
            "A robots.txt edit is not instant. When a site has just changed its rules, a crawl observing the old "
            "behaviour is expected rather than evidence of a defect."
        ),
        whyItMatters=(
            "It sets the right expectation after a fix and prevents SEO Maker from reporting a stale-cache effect as "
            "an unresolved problem, or advising repeated re-crawls within the cache window."
        ),
        appliesWhen=[
            "A site has recently edited robots.txt and is checking whether the change took effect",
            "Explaining the expected delay after a robots.txt fix",
        ],
        doesNotApplyWhen=[
            "The file is unreachable, where crawlers may retain a cached copy for longer",
            "Explaining delays in indexing, which are governed by different and much longer timescales",
        ],
        entities=["site", "technical_configuration", "crawler"],
        relatedIssues=["robots.txt change not reflected yet"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "After a robots.txt change, tell the user to allow roughly 24 hours before re-testing, and use standard "
            "HTTP cache-control headers if faster propagation matters."
        ),
        applicability=["technical_audit", "site_audit", "reporting_language"],
        limitations=(
            "24 hours is a SHOULD NOT ceiling, not a guarantee. Actual refresh intervals vary by crawler and by how "
            "often the host is crawled."
        ),
        relatedKnowledge=["seo-tech-robots-5xx-disallow"],
        tags=["robots.txt", "caching", "propagation"],
        location="Section 2.4 (Caching), page 9",
        quote="Crawlers SHOULD NOT use the cached version for more than 24 hours, unless the robots.txt file is unreachable.",
    ),
    it(
        id="seo-tech-robots-parse-limit-500kib",
        subtopic="limits",
        claimType="specification_rule",
        title="Crawlers must parse at least the first 500 kibibytes of robots.txt",
        principle=(
            "RFC 9309 Section 2.5 states that crawlers SHOULD impose a parsing limit to protect their systems and "
            "that this limit MUST be at least 500 kibibytes."
        ),
        explanation=(
            "Rules beyond roughly 500 KiB may never be read. A very large robots.txt is therefore a real risk to the "
            "rules at the bottom of the file, and file size is trivially measurable during a crawl."
        ),
        whyItMatters=(
            "Large generated robots.txt files do occur on big ecommerce and faceted-navigation sites, and the "
            "resulting silent rule truncation is otherwise very hard to diagnose."
        ),
        appliesWhen=[
            "The fetched robots.txt approaches or exceeds 500 KiB",
            "A site's robots.txt is machine-generated from a large URL or parameter list",
        ],
        doesNotApplyWhen=[
            "Ordinary robots.txt files, which are far below the limit",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["oversized robots.txt", "robots.txt rules silently truncated"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Flag a robots.txt approaching 500 KiB and recommend consolidating rules with wildcards so the important "
            "directives sit well inside the guaranteed parse window."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis"],
        limitations=(
            "500 KiB is the minimum a crawler must honour, not a maximum it will read; a given crawler may parse "
            "more. The standard sets a floor, so the risk is a ceiling on guarantees, not a certainty of truncation."
        ),
        relatedKnowledge=["seo-tech-robots-standardised"],
        tags=["robots.txt", "limits", "file_size"],
        location="Section 2.5 (Limits), page 9",
        quote="Crawlers SHOULD impose a parsing limit to protect their systems [...] The parsing limit MUST be at least 500 kibibytes.",
    ),
    it(
        id="seo-tech-robots-redirect-limit",
        subtopic="error_handling",
        claimType="specification_rule",
        title="robots.txt redirects are followed for at least five hops, then treated as unavailable",
        principle=(
            "RFC 9309 Section 2.3.1.2 states that crawlers SHOULD follow at least five consecutive redirects, even "
            "across authorities; a robots.txt reached within five redirects MUST be fetched, parsed and applied in "
            "the context of the initial authority; beyond five, crawlers MAY assume the file is unavailable."
        ),
        explanation=(
            "Redirecting robots.txt is permitted and the rules still bind to the original host. But a long redirect "
            "chain degrades to the unavailable case, which means no restrictions apply."
        ),
        whyItMatters=(
            "Sites that centralise robots.txt behind redirects can silently lose their rules once the chain grows, "
            "and the failure mode - full crawlability - is the opposite of what the owner intended."
        ),
        appliesWhen=[
            "The /robots.txt request is answered with one or more redirects",
            "robots.txt is served from a different host than the site being audited",
        ],
        doesNotApplyWhen=[
            "robots.txt returns 200 directly",
            "Reasoning about redirects on ordinary content URLs, which are governed by different guidance",
        ],
        entities=["site", "technical_configuration", "crawler"],
        relatedIssues=["robots.txt redirect chain", "robots.txt rules lost to redirects"],
        checks=["robots", "robots_audit"],
        recommendedAction=(
            "Record the full robots.txt redirect chain. Recommend serving the file directly at each host, and flag "
            "any chain approaching five hops."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis"],
        limitations=(
            "Five is a SHOULD floor, so some crawlers follow more and some fewer. The rules apply in the context of "
            "the initial authority, which the standard states but individual implementations may handle differently."
        ),
        relatedKnowledge=["seo-tech-robots-4xx-unavailable", "seo-tech-robots-file-requirements"],
        tags=["robots.txt", "redirects", "crawling"],
        location="Section 2.3.1.2 (Redirects), page 8",
        quote="The crawlers SHOULD follow at least five consecutive redirects, even across authorities [...] If there are more than five consecutive redirects, crawlers MAY assume that the robots.txt file is unavailable.",
    ),
    it(
        id="seo-tech-robots-sitemap-record",
        subtopic="other_records",
        claimType="specification_rule",
        title="Sitemap lines are outside the protocol and must not break user-agent groups",
        principle=(
            "RFC 9309 Section 2.2.4 states that crawlers MAY interpret records that are not part of the protocol, "
            "such as Sitemaps, and MAY be lenient about them - but parsing such records MUST NOT interfere with the "
            "defined records; specifically, a Sitemaps record MUST NOT terminate a group."
        ),
        explanation=(
            "The Sitemap directive is a widely honoured convention, not part of the standardised rule grammar. Its "
            "placement inside a file does not reorganise the user-agent groups around it."
        ),
        whyItMatters=(
            "Parsers that let a Sitemap line close a group produce wrong blocking answers, and a sitemap declaration "
            "is a useful discovery signal that should be read without being treated as a rule."
        ),
        appliesWhen=[
            "Parsing a robots.txt that interleaves Sitemap lines with user-agent groups",
            "Discovering sitemaps declared in robots.txt",
        ],
        doesNotApplyWhen=[
            "Judging whether the declared sitemap is valid or its URLs are indexable - that is separate analysis",
        ],
        entities=["site", "technical_configuration"],
        relatedIssues=["sitemap directive splitting a robots.txt group", "sitemap discovery"],
        checks=["robots", "robots_audit", "sitemap", "sitemap_audit"],
        recommendedAction=(
            "Read Sitemap directives for discovery but do not let them affect group parsing. Absence of a Sitemap "
            "line is a minor opportunity, not a rule violation."
        ),
        applicability=["technical_audit", "site_audit", "crawl_analysis"],
        limitations=(
            "Because these records are outside the protocol, support and leniency vary by crawler, and the standard "
            "makes no promise that a declared sitemap will be fetched."
        ),
        relatedKnowledge=["seo-tech-robots-group-selection"],
        tags=["robots.txt", "sitemap", "parsing"],
        location="Section 2.2.4 (Other Records), page 7",
        quote="Parsing of other records MUST NOT interfere with the parsing of explicitly defined records [...] For example, a \"Sitemaps\" record MUST NOT terminate a group.",
    ),
]
