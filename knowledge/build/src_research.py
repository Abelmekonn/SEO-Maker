# -*- coding: utf-8 -*-
"""Research knowledge: Broder (SIGIR Forum 2002) and Aggarwal et al. GEO (KDD 2024).

Both sources are research. Every item preserves population, method, and the
authors' own stated limitations. No correlation is restated as causation.
"""

from common import item, BRODER, GEOPAPER

BROD = dict(
    domain="seo", category="content", source=BRODER,
    knowledgeType="research", evidenceType="research",
    version="ACM SIGIR Forum 36(2), Fall 2002", reviewBy="2027-09-22",
)

GEOC = dict(
    domain="geo", category="research", source=GEOPAPER,
    knowledgeType="research", evidenceType="experiment",
    version="KDD '24 (arXiv:2311.09735v3, 28 June 2024)", reviewBy="2026-12-22",
)


def b(**kw):
    return item(**{**BROD, **kw})


def g(**kw):
    return item(**{**GEOC, **kw})


ITEMS = [
    # ---------------- Broder ----------------
    b(
        id="seo-research-broder-intent-distribution",
        topic="search_intent", subtopic="distribution",
        claimType="experimental_result",
        evidenceStrength="moderate", confidence="medium",
        title="Broder measured roughly 20-25% navigational, 48% informational and 30% transactional queries",
        principle=(
            "Broder measured intent prevalence two ways on AltaVista. A user survey run between 26 June and 3 "
            "November 2001 with 3,190 valid returns found 24.5% navigational and 68.4% non-navigational, with "
            "transactional estimated at more than 22% and, from a 200-query sample with free-text explanations, "
            "around 36%. A separate log analysis of 1,000 randomly selected queries - reduced to the first 400 "
            "after removing non-English and sexually oriented queries - found 20% navigational, 48% informational "
            "and 30% transactional. The paper states that informational queries constitute less than 50% of web "
            "searches."
        ),
        explanation=(
            "These are the origin figures for the intent distributions still quoted in SEO. They are useful as "
            "historical grounding and as an order-of-magnitude reminder that informational intent is a minority, "
            "but they describe one engine in 2001."
        ),
        whyItMatters=(
            "SEO advice frequently cites intent percentages without provenance. Carrying the real numbers with "
            "their method lets SEO Maker cite them honestly or decline to."
        ),
        appliesWhen=[
            "Discussing the historical basis of the intent taxonomy",
            "A user cites intent distribution percentages and asks where they come from",
        ],
        doesNotApplyWhen=[
            "Estimating intent distribution for any current market, engine or vertical",
            "Any site-specific or industry-specific intent modelling",
        ],
        entities=["query"],
        relatedIssues=["intent distribution assumptions"],
        checks=["none"],
        recommendedAction=(
            "Cite these figures only with their date, engine and method attached, and do not use them to model a "
            "current site's query mix."
        ),
        applicability=["intent_analysis", "content_analysis"],
        limitations=(
            "AltaVista data from 2001, published 2002. The survey was self-selected with about a 10% response rate "
            "and Broder notes sexual-content queries were under 1% of survey responses against about 12% of the "
            "log, so the samples are not comparable. The two methods disagree, and the author describes log-derived "
            "intent inference as \"very soft\". Search behaviour, engines and the web have changed substantially."
        ),
        relatedKnowledge=["seo-content-search-intent-taxonomy", "seo-content-google-intent-taxonomy", "seo-research-broder-intent-uncertainty"],
        tags=["search_intent", "research", "historical", "altavista"],
        location="Section 4 (Statistics), Figures 4 and 5",
        quote="Type of query | User Survey | Query Log Analysis. Navigational 24.5% | 20%. Informational ?? (estimated 39%) | 48%. Transactional > 22% (estimated 36%) | 30%.",
    ),
    b(
        id="seo-research-broder-intent-uncertainty",
        topic="search_intent", subtopic="inference_limits",
        claimType="expert_opinion",
        evidenceStrength="moderate", confidence="medium",
        title="Intent cannot be reliably inferred from the query text alone",
        principle=(
            "Broder states explicitly that there is no assumption that intent can be inferred with any certitude "
            "from the query, that the examples given might have alternative explanations, and describes inferring "
            "user intent from a query as at best an inexact science and usually a wild guess."
        ),
        explanation=(
            "The author of the taxonomy everyone cites is explicit that the classification is not recoverable from "
            "the query string. Any intent label SEO Maker assigns is a hypothesis."
        ),
        whyItMatters=(
            "Intent classification drives content recommendations. Treating a guessed label as fact produces "
            "confident but wrong advice about what a page should be."
        ),
        appliesWhen=[
            "Assigning an intent label to a target query",
            "Making a content recommendation that depends on assumed intent",
        ],
        doesNotApplyWhen=[
            "Queries where the intent is explicit, such as a brand name or an explicit transactional phrase",
        ],
        entities=["query", "content"],
        relatedIssues=["intent misclassification", "overconfident intent labels"],
        checks=["none"],
        recommendedAction=(
            "Present intent classifications as inferences with stated reasoning, and note where an alternative "
            "reading is plausible."
        ),
        applicability=["intent_analysis", "content_analysis", "reporting_language"],
        limitations=(
            "A 2002 observation about query-log analysis. Modern engines use signals beyond the query string - "
            "location, history, context - that were not available to this analysis."
        ),
        relatedKnowledge=["seo-research-broder-intent-distribution", "seo-qrg-query-multiple-meanings"],
        tags=["search_intent", "uncertainty", "research"],
        location="Section 3 (A taxonomy of web searches); Section 4 (Log analysis)",
        quote="Since inferring the user intent from the query is at best an inexact science, but usually a wild guess, the data obtained from log analysis is very \"soft\".",
    ),
    b(
        id="seo-research-broder-hub-intent",
        topic="search_intent", subtopic="hub_seeking",
        claimType="experimental_result",
        evidenceStrength="weak", confidence="medium",
        title="About 15% of searches sought a collection of links rather than a single best page",
        principle=(
            "Broder reports that in almost 15% of all searches the desired target is a good collection of links on "
            "the subject rather than a good document - a good hub rather than a good authority. The survey question "
            "found 14.83% wanting a site that is a collection of links on the topic against 76.62% wanting the best "
            "site on the topic."
        ),
        explanation=(
            "A meaningful minority of searches want a curated resource list. This supports hub, directory and "
            "roundup page types as a legitimate response to some queries rather than as thin content."
        ),
        whyItMatters=(
            "Link-collection and resource pages often trip thin-content checks despite serving a real and measured "
            "user need."
        ),
        appliesWhen=[
            "A page is a curated resource list, directory, or hub",
            "Deciding whether a link-heavy page is thin or purposeful",
        ],
        doesNotApplyWhen=[
            "Link pages with no curation or added value, which Google's guidelines treat as low quality",
            "Estimating current demand for hub pages in any specific topic",
        ],
        entities=["page", "content", "query"],
        relatedIssues=["hub page flagged as thin", "resource page value"],
        checks=["words", "links"],
        recommendedAction=(
            "Judge curated hub pages by the quality of their curation rather than text volume, and note that a "
            "measurable share of searches seek exactly this page type."
        ),
        applicability=["content_analysis", "intent_analysis", "page_audit"],
        limitations=(
            "AltaVista survey data from 2001 with self-selected respondents, in a pre-social, pre-app web. The "
            "figure should not be treated as a current proportion for any market."
        ),
        relatedKnowledge=["seo-research-broder-intent-distribution", "seo-qrg-page-type-not-quality"],
        tags=["hub_pages", "search_intent", "research", "historical"],
        location="Section 3 (Informational queries); Section 4, Figure 4",
        quote="It is interesting to note, that in almost 15% of all searches the desired target is a good collection of links on the subject, rather than a good document.",
    ),
    b(
        id="seo-research-anchor-text-navigational",
        topic="anchor_text", subtopic="navigational_queries",
        claimType="experimental_result",
        evidenceStrength="moderate", confidence="medium",
        title="Link analysis and anchor text were found especially effective for navigational queries",
        principle=(
            "Broder describes second-generation search engines as using off-page, web-specific data such as link "
            "analysis, anchor text and click-through data, and states that link analysis and anchor text seem "
            "crucial for navigational queries. He cites Craswell, Hawking and Robertson's SIGIR 2001 work showing "
            "anchor text provides very effective help for navigational queries."
        ),
        explanation=(
            "Anchor text's measured value is strongest for finding a specific known destination. That is a narrower "
            "and better-supported claim than the general assertion that anchor text drives rankings."
        ),
        whyItMatters=(
            "It gives internal anchor text recommendations a real evidence basis while keeping the claim within "
            "what the research supports."
        ),
        appliesWhen=[
            "Explaining why descriptive internal anchor text matters",
            "Auditing navigation and links to key destination pages",
        ],
        doesNotApplyWhen=[
            "Claiming anchor text drives rankings generally across query types",
            "Recommending repetitive exact-match anchors",
        ],
        entities=["link", "page", "site"],
        relatedIssues=["generic anchor text", "poor navigation labelling"],
        checks=["links"],
        recommendedAction=(
            "Recommend descriptive anchors for important destination pages, framing the evidence as strongest for "
            "helping users and engines find a known destination."
        ),
        applicability=["internal_link_analysis", "page_audit", "site_audit"],
        limitations=(
            "A 2002 characterisation of second-generation engines, citing 2001 evaluations. Search engines have "
            "changed substantially and the paper offers no effect size for modern systems."
        ),
        relatedKnowledge=["seo-il-anchor-text-descriptive", "seo-research-broder-intent-distribution"],
        tags=["anchor_text", "links", "navigational", "research", "historical"],
        location="Section 5 (The evolution of search engines); reference [CHR01]",
        quote="Link analysis and anchortext seems crucial for navigational queries.",
    ),

    # ---------------- GEO paper ----------------
    g(
        id="geo-research-engine-was-simulated",
        topic="geo_methodology", subtopic="engine_setup",
        claimType="experimental_result",
        evidenceStrength="moderate", confidence="high",
        title="The GEO paper's headline results come from a simulated engine, not a production one",
        principle=(
            "The GEO paper's main experiments use a two-step setup the authors built: the top 5 sources are fetched "
            "from Google for each query, and gpt-3.5-turbo generates the response from those sources, sampled 5 "
            "times at temperature 0.7. Only a separate, smaller evaluation in Section 6 uses Perplexity.ai, a "
            "deployed generative engine. Visibility is measured with two metrics the authors define: "
            "Position-Adjusted Word Count, and Subjective Impression scored by GPT-3.5 using a G-Eval style "
            "template and then normalised to match the first metric's mean and variance."
        ),
        explanation=(
            "This is the single most important scope fact about the paper. Its headline numbers describe a "
            "researcher-built pipeline and author-defined metrics, not measured behaviour of any commercial AI "
            "search product."
        ),
        whyItMatters=(
            "Every GEO effect size in circulation traces back to this paper. Without the setup attached, those "
            "numbers read as measurements of AI Overviews or ChatGPT, which they are not."
        ),
        appliesWhen=[
            "Citing any effect size from the GEO paper",
            "A user cites GEO statistics from a vendor blog post",
            "Assessing GEO advice that claims research backing",
        ],
        doesNotApplyWhen=[
            "The Perplexity evaluation in Section 6, which used a real deployed engine on a subset",
        ],
        entities=["content", "page"],
        relatedIssues=["overstated GEO effect sizes", "GEO research citations"],
        checks=["none"],
        recommendedAction=(
            "Whenever a GEO paper figure is cited, state the engine and metric it was measured on, and never "
            "present it as an expected uplift in a named commercial product."
        ),
        applicability=["geo_analysis", "myth_guard", "reporting_language"],
        limitations=(
            "The metrics are proposed by the authors rather than validated externally, and Subjective Impression is "
            "scored by an LLM. The generator model, gpt-3.5-turbo, is several generations old."
        ),
        relatedKnowledge=["geo-research-citation-quotation-stats", "geo-research-rank-dependency", "geo-research-paper-limitations"],
        tags=["geo", "research", "methodology", "scope"],
        location="Section 3.1 Evaluated Generative Engine; Section 2.2.1; Section 6",
        quote="The answer is then generated by the gpt3.5-turbo model [20] using the same prompt as prior work [14]. We sample 5 different responses at temperature=0.7, to reduce statistical deviations.",
    ),
    g(
        id="geo-research-rank-dependency",
        topic="geo_tactics", subtopic="rank_dependency",
        claimType="experimental_result",
        evidenceStrength="moderate", confidence="medium",
        title="GEO methods helped low-ranked sources most and reduced visibility for the top-ranked source",
        principle=(
            "The paper reports relative visibility change by the source's search ranking. For Cite Sources the "
            "change was -30.3% at rank 1 and +115.1% at rank 5; Quotation Addition was -22.9% at rank 1 and +99.7% "
            "at rank 5; Statistics Addition was -20.6% at rank 1 and +97.9% at rank 5. The authors conclude that "
            "GEO is especially helpful for lower ranked websites, and separately frame this as levelling the "
            "playing field for smaller sites."
        ),
        explanation=(
            "The effect is not uniform and, for the already best-ranked source, it was negative in this setup. "
            "Advice derived from this paper should be conditioned on where the site already stands."
        ),
        whyItMatters=(
            "It is the most consequential nuance in the paper and it is almost always dropped when the 40% headline "
            "is repeated. Applied to a market leader, the paper's own data suggests the tactics could cost "
            "visibility."
        ),
        appliesWhen=[
            "Considering GEO content tactics for a site that already ranks well",
            "A user cites GEO uplift figures without qualification",
        ],
        doesNotApplyWhen=[
            "Treating the rank-1 decline as an established effect in production engines - it is one measurement in "
            "one simulated setup",
        ],
        entities=["content", "page", "site"],
        relatedIssues=["GEO tactic selection", "unqualified GEO advice"],
        checks=["none"],
        recommendedAction=(
            "When GEO tactics come up, note that the measured benefit was concentrated in lower-ranked sources and "
            "was negative for the top-ranked one in this experiment."
        ),
        applicability=["geo_analysis", "content_analysis", "prioritisation"],
        limitations=(
            "Measured on the authors' simulated engine with their own visibility metric. The paper reports these as "
            "relative changes in a table without significance testing, and the mechanism is not explained."
        ),
        relatedKnowledge=["geo-research-engine-was-simulated", "geo-research-citation-quotation-stats"],
        tags=["geo", "research", "ranking", "effect_heterogeneity"],
        location="Section 5 (Analysis), Table 2",
        quote="Table 2: Visibility changes through GEO methods for sources with different Rankings in Search Engine. GEO is especially helpful for lower ranked websites.",
    ),
    g(
        id="geo-research-authoritative-tone-ineffective",
        topic="geo_tactics", subtopic="authoritative_tone",
        claimType="experimental_result",
        evidenceStrength="moderate", confidence="medium",
        title="Making content sound more authoritative produced no significant improvement",
        principle=(
            "The paper tested an Authoritative method that modifies text style to be more persuasive and "
            "authoritative. The authors report that although one would expect a more persuasive and authoritative "
            "tone to boost visibility, they find no significant improvement, demonstrating that generative engines "
            "are already somewhat robust to such changes, and conclude that owners should focus instead on "
            "improving content presentation and credibility."
        ),
        explanation=(
            "This is a negative result against a widely marketed GEO tactic - writing with more authoritative "
            "phrasing. The measured lever was verifiable substance, not confident tone."
        ),
        whyItMatters=(
            "Tone-rewriting is commonly sold as GEO work. A negative result from the field's founding paper is a "
            "useful counterweight."
        ),
        appliesWhen=[
            "A user or vendor proposes rewriting content in a more authoritative voice for AI visibility",
            "Evaluating GEO service offerings",
        ],
        doesNotApplyWhen=[
            "Genuine credibility improvements such as sourcing, data and author expertise, which the same paper "
            "found did help",
        ],
        entities=["content", "page"],
        relatedIssues=["tone rewriting proposals", "GEO service claims"],
        checks=["none"],
        recommendedAction=(
            "Decline to recommend authoritative-sounding rewrites. Redirect to verifiable substance: sources, "
            "quotations and data."
        ),
        applicability=["geo_analysis", "myth_guard", "content_analysis"],
        limitations=(
            "One method in one simulated setup, with no significance test reported. In the Perplexity evaluation "
            "the Authoritative method was not among those reported at all."
        ),
        relatedKnowledge=["geo-research-citation-quotation-stats", "geo-research-engine-was-simulated", "geo-heuristic-answer-first-structure"],
        tags=["geo", "research", "tone", "myth_guard", "negative_result"],
        location="Section 4 (Results)",
        quote="However, we find no significant improvement, demonstrating that Generative Engines are already somewhat robust to such changes.",
    ),
    g(
        id="geo-research-perplexity-replication",
        topic="geo_tactics", subtopic="deployed_engine",
        claimType="experimental_result",
        evidenceStrength="moderate", confidence="medium",
        title="On Perplexity.ai the measured gains were smaller, and keyword stuffing performed worse than baseline",
        principle=(
            "Evaluated on Perplexity.ai, a deployed generative engine, Quotation Addition performed best on "
            "Position-Adjusted Word Count with a 22% improvement over baseline; Cite Sources and Statistics Addition "
            "showed improvements of up to 9% and 37% on the two metrics; and Keyword Stuffing performed 10% worse "
            "than the baseline on Position-Adjusted Word Count."
        ),
        explanation=(
            "This is the only part of the paper measured against a real product, and the gains are roughly half the "
            "headline figure. It is the number to cite when a real engine is the subject."
        ),
        whyItMatters=(
            "It is the closest thing in the corpus to evidence about a production AI search engine, and it "
            "moderates the headline claim considerably."
        ),
        appliesWhen=[
            "Discussing what GEO research shows about a real deployed engine",
            "A user asks whether GEO tactics work in practice",
        ],
        doesNotApplyWhen=[
            "Google's AI Overviews or AI Mode, which were not tested",
            "Treating the Perplexity numbers as current - the evaluation predates June 2024",
        ],
        entities=["content", "page"],
        relatedIssues=["GEO effectiveness questions"],
        checks=["none"],
        recommendedAction=(
            "When citing GEO evidence about deployed engines, use the Perplexity figures and name the engine and "
            "date, not the headline 40%."
        ),
        applicability=["geo_analysis", "content_analysis", "reporting_language"],
        limitations=(
            "A single engine at a single point in time before June 2024, on a test subset, using the authors' own "
            "metrics. Perplexity publishes no ranking or citation formula, and its systems have changed since. "
            "Notably, Keyword Stuffing scored above baseline on the Subjective Impression metric in the same table "
            "even while scoring 10% below on the primary metric."
        ),
        relatedKnowledge=["geo-research-engine-was-simulated", "geo-research-keyword-stuffing-ineffective", "geo-research-citation-quotation-stats"],
        tags=["geo", "research", "perplexity", "deployed_engine"],
        location="Section 6 (GEO in the Wild), Table 5",
        quote="Quotation Addition performs best in Position-Adjusted Word Count with a 22% improvement over the baseline. [...] Keyword Stuffing [...] performs 10% worse than the baseline.",
    ),
    g(
        id="geo-research-domain-dependence",
        topic="geo_tactics", subtopic="domain_dependence",
        claimType="experimental_result",
        evidenceStrength="weak", confidence="medium",
        title="Which GEO method worked best varied by subject domain",
        principle=(
            "The paper reports that the effectiveness of GEO methods varies across query domains and gives a "
            "per-method breakdown of top-performing categories: Authoritative performed best for Debate, History "
            "and Science; Fluency Optimization for Business, Science and Health; Cite Sources for Statement, Facts "
            "and Law & Government; Quotation Addition for People & Society, Explanation and History; and Statistics "
            "Addition for Law & Government, Debate and Opinion. The authors conclude that owners should make "
            "domain-specific targeted adjustments."
        ),
        explanation=(
            "There is no single GEO tactic that works everywhere, even within the paper's own setup. Any blanket "
            "GEO checklist contradicts the source it usually cites."
        ),
        whyItMatters=(
            "It undercuts one-size-fits-all GEO advice using the founding paper's own analysis, which is a strong "
            "position for SEO Maker to take."
        ),
        appliesWhen=[
            "Evaluating a generic GEO checklist",
            "A user asks which GEO tactic to apply to their topic",
        ],
        doesNotApplyWhen=[
            "Prescribing a specific method for a specific industry - the category labels are the paper's own and "
            "do not map cleanly onto real verticals",
        ],
        entities=["content", "page"],
        relatedIssues=["generic GEO checklists"],
        checks=["none"],
        recommendedAction=(
            "Note that measured effectiveness varied by subject area, and decline to present a universal GEO "
            "tactic list."
        ),
        applicability=["geo_analysis", "myth_guard", "content_analysis"],
        limitations=(
            "Categories were assigned by GPT-4 with manual verification on the test split, and the authors "
            "acknowledge possible labelling discrepancies. Rankings of top categories are reported without effect "
            "sizes or significance tests."
        ),
        relatedKnowledge=["geo-research-engine-was-simulated", "geo-research-citation-quotation-stats"],
        tags=["geo", "research", "domain_specific"],
        location="Section 5.1 Domain-Specific Generative Engine Optimizations, Table 3",
        quote="Overall, our analysis suggests that website owners should strive towards making domain-specific targeted adjustments to their websites for higher visibility.",
    ),
    g(
        id="geo-research-benchmark-composition",
        topic="geo_methodology", subtopic="benchmark",
        claimType="experimental_result",
        evidenceStrength="moderate", confidence="high",
        title="GEO-bench is 10,000 queries, deliberately 80% informational",
        principle=(
            "GEO-bench comprises 10,000 queries split 8,000 train, 1,000 validation and 1,000 test, drawn from nine "
            "datasets including real anonymised user queries, AllSouls essay questions, Perplexity.ai Discover, "
            "ELI5, and GPT-4 generated queries. The authors state they preserve the real-world query distribution "
            "with 80% informational queries and 10% each transactional and navigational. Each query is augmented "
            "with cleaned text from the top 5 Google results, and queries span 25 domains."
        ),
        explanation=(
            "The benchmark is heavily informational by design. Findings from it say little about transactional or "
            "navigational queries, which is where most commercial sites earn revenue."
        ),
        whyItMatters=(
            "It bounds who the paper's conclusions apply to. An ecommerce site's key queries are barely represented "
            "in the dataset the GEO field is built on."
        ),
        appliesWhen=[
            "Assessing whether GEO research applies to a particular site",
            "A commercial or transactional site asks about GEO tactics",
        ],
        doesNotApplyWhen=[
            "Informational publisher content, which the benchmark does represent well",
        ],
        entities=["query", "content"],
        relatedIssues=["GEO research applicability"],
        checks=["none"],
        recommendedAction=(
            "Note the 80% informational composition when applying GEO findings to transactional or navigational "
            "content, and lower confidence accordingly."
        ),
        applicability=["geo_analysis", "ecommerce_analysis", "reporting_language"],
        limitations=(
            "A portion of the queries were generated by GPT-4 to supplement diversity. The claimed real-world "
            "distribution is asserted rather than independently validated, and the authors note query distributions "
            "change over time."
        ),
        relatedKnowledge=["geo-research-engine-was-simulated", "geo-research-domain-dependence"],
        tags=["geo", "research", "benchmark", "scope"],
        location="Section 3.2 Benchmark: GEO-bench",
        quote="We preserve the real-world query distribution, with our benchmark containing 80% informational queries and 10% each for transactional and navigational queries.",
    ),
    g(
        id="geo-research-paper-limitations",
        topic="geo_methodology", subtopic="stated_limitations",
        claimType="experimental_result",
        evidenceStrength="strong", confidence="high",
        title="The GEO authors state they did not evaluate any effect on search rankings",
        principle=(
            "The paper's Limitations section states that owing to the black-box nature of search engine algorithms "
            "the authors did not evaluate how GEO methods affect search rankings, though they reason the changes "
            "are textual and do not affect metadata such as domain name or backlinks, so are less likely to affect "
            "rankings. They also note methods may need to adapt as generative engines evolve, query nature changes "
            "over time, larger context lengths may reduce the impact of search rankings, and query tagging may "
            "contain subjective or labelling errors."
        ),
        explanation=(
            "The authors are explicit that the classic-search consequences of these content changes are unmeasured. "
            "Their expectation of neutrality is reasoning, not a finding."
        ),
        whyItMatters=(
            "SEO Maker advises on both SEO and GEO. Recommending a GEO tactic without noting that its classic-search "
            "effect was never measured would misrepresent the evidence."
        ),
        appliesWhen=[
            "Recommending any content change justified by GEO research",
            "A user asks whether GEO tactics could hurt normal rankings",
        ],
        doesNotApplyWhen=[
            "Content changes justified by Google's own documentation rather than this paper",
        ],
        entities=["content", "page"],
        relatedIssues=["GEO tactic side effects"],
        checks=["none"],
        recommendedAction=(
            "State that the paper did not measure search-ranking effects, and prefer changes that are justified by "
            "official documentation as well as by the research."
        ),
        applicability=["geo_analysis", "reporting_language", "prioritisation"],
        limitations=(
            "This item records the authors' own stated limitations, which is a strength of the source rather than a "
            "weakness of the item. The neutrality expectation remains untested."
        ),
        relatedKnowledge=["geo-research-engine-was-simulated", "geo-research-rank-dependency", "geo-research-combination-subset"],
        tags=["geo", "research", "limitations", "scope"],
        location="Section 9 (Limitations)",
        quote="Further, owing to the black-box nature of search engine algorithms, we didn't evaluate how GEO methods affect search rankings.",
    ),
    g(
        id="geo-research-combination-subset",
        topic="geo_tactics", subtopic="method_combination",
        claimType="experimental_result",
        evidenceStrength="weak", confidence="medium",
        title="The best method combination was measured on only 200 examples",
        principle=(
            "The paper reports that combining GEO methods can enhance performance, with the best combination - "
            "Fluency Optimization plus Statistics Addition - outperforming any single GEO strategy by more than "
            "5.5%. A footnote states that due to cost constraints this analysis was conducted on a subset of 200 "
            "examples from the test split, so the numbers differ from those in the paper's main results table."
        ),
        explanation=(
            "The combination finding rests on a much smaller sample than the headline results and the authors flag "
            "it themselves. It should carry noticeably lower confidence."
        ),
        whyItMatters=(
            "The combination figure circulates without its footnote. Carrying the sample size is what keeps the "
            "claim proportionate."
        ),
        appliesWhen=[
            "A user cites the GEO method-combination finding",
            "Assessing advice that stacks multiple GEO tactics",
        ],
        doesNotApplyWhen=[
            "The paper's main single-method results, which used the full test split",
        ],
        entities=["content", "page"],
        relatedIssues=["GEO tactic stacking claims"],
        checks=["none"],
        recommendedAction=(
            "Cite the combination result only with its 200-example sample size attached, and treat it as "
            "preliminary."
        ),
        applicability=["geo_analysis", "reporting_language", "myth_guard"],
        limitations=(
            "200 examples, on the authors' simulated engine, with author-defined metrics and no significance "
            "testing. The authors state the numbers are not comparable with their main table."
        ),
        relatedKnowledge=["geo-research-fluency-and-combination", "geo-research-engine-was-simulated", "geo-research-paper-limitations"],
        tags=["geo", "research", "sample_size", "combination"],
        location="Section 5.3 Combination of GEO Strategies, Figure 4 and footnote 4",
        quote="Due to cost constraints, the analysis was conducted on a subset of 200 examples from the test split, and therefore the numbers presented here differ from those in Table 1.",
    ),
]
