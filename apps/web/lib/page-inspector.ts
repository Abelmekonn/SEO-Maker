import type {
  ContentSuggestion,
  HeadingSuggestion,
  ImageAltSuggestion,
  InternalLinkSuggestion,
  MetaSuggestion,
  PageRecommendation,
  SchemaMarkupSuggestion,
  TitleSuggestion,
} from "@seo-maker/ai/schemas";
import type { FixFeature, FixStrategy, PageEvidence, PlannedFix } from "@seo-maker/core/page";
import type { Page, PageIssue } from "@seo-maker/db";
import { friendlyAiError, type FeatureResult } from "@/lib/ai-results";
import { type CheckId, checks, checkValue, isCrawled } from "@/lib/page-audit";

/**
 * The page detail's "Everything" area, as data: every check with what the
 * crawler found, the page's own code for it, how it gets fixed, and any fix
 * AI has written.
 *
 * Code is reconstructed from the crawl's evidence (the title, meta tags,
 * headings, links, images and JSON-LD it read), never invented. Where the
 * page has nothing for a check, the code says so in a comment. Fixes come
 * from the deterministic fix plan and from stored AI results, which were
 * written from the same evidence.
 */

export type InspectorStatus = "pass" | "warning" | "fail" | "pending";

export type CodeLanguage = "html" | "text" | "http";

/** One fix option, as the lines it adds to the page. */
export type FixOption = {
  label: string;
  lines: string[];
  /** Why this option, when the source gives a reason. */
  note: string | null;
};

export type InspectorFix = {
  /** Where the fix comes from: the crawl, AI, or withheld for lack of evidence. */
  strategy: FixStrategy;
  feature: FixFeature | null;
  reason: string;
  /** A fix taken from the crawl, ready to use: no AI needed. */
  fromCrawl: FixOption | null;
};

export type InspectorResult = {
  feature: string;
  ok: boolean;
  /** What went wrong, in words a user can act on. */
  error: string | null;
  createdAt: string;
  confidence: string | null;
  needsHumanReview: boolean;
  sources: number;
  diagnosis: string | null;
  options: FixOption[];
  /** Things to know about the whole result, e.g. images skipped. */
  notes: string[];
};

export type InspectorCheck = {
  id: CheckId;
  label: string;
  hint: string;
  status: InspectorStatus;
  severity: string | null;
  observed: string;
  detail: string | null;
  evidence: string | null;
  recommendation: string | null;
  /** A passing check offered for rewriting on request (title, meta description). */
  optional: boolean;
  /** AI's explanation of this check, from the page analysis. */
  why: { issue: string; whyItMatters: string; action: string; actionable: boolean } | null;
  fix: InspectorFix | null;
  code: {
    /** Where on the page (or site) the code lives, like a file name. */
    location: string;
    language: CodeLanguage;
    /** The page's own code for this check, from the crawl. Empty when it has none. */
    current: string[];
    /** Said in a comment when there is no current code. */
    missing: string | null;
  };
  result: InspectorResult | null;
};

export type PageAnalysis = {
  summary: string;
  confidence: string;
  needsHumanReview: boolean;
  groundedIn: string[];
  createdAt: string;
  mode: string;
  knowledgeVersion: string | null;
  /** Written for an earlier crawl of this page. */
  earlier: { at: string; fixed: number } | null;
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const MAX_LINES = 12;

const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const text = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const TAG: Record<string, (value: string) => string> = {
  title: (value) => `<title>${text(value)}</title>`,
  meta: (value) => `<meta name="description" content="${attr(value)}" />`,
  heading: (value) => `<h1>${text(value)}</h1>`,
};

/** The page's own code for one check, as the crawl read it. */
function currentCode(page: Page, id: CheckId): InspectorCheck["code"] {
  const evidence = (page.evidence ?? null) as PageEvidence | null;
  const address = page.finalUrl ?? page.url;
  switch (id) {
    case "title":
      return page.title
        ? { location: "<head>", language: "html", current: [TAG.title(page.title)], missing: null }
        : { location: "<head>", language: "html", current: [], missing: "This page has no <title>." };
    case "meta":
      return page.metaDesc
        ? { location: "<head>", language: "html", current: [TAG.meta(page.metaDesc)], missing: null }
        : { location: "<head>", language: "html", current: [], missing: "This page has no meta description." };
    case "h1":
      return page.h1
        ? {
            location: "<body>",
            language: "html",
            current: [
              TAG.heading(page.h1),
              ...((page.h1Count ?? 1) > 1 ? [`<!-- and ${(page.h1Count ?? 1) - 1} more <h1> on the page -->`] : []),
            ],
            missing: null,
          }
        : { location: "<body>", language: "html", current: [], missing: "You don't have an H1 on this page." };
    case "h2": {
      const h2s = (evidence?.headings ?? []).filter((heading) => heading.level === 2);
      return h2s.length > 0
        ? { location: "<body>", language: "html", current: h2s.slice(0, MAX_LINES).map((heading) => `<h2>${text(heading.text)}</h2>`), missing: null }
        : { location: "<body>", language: "html", current: [], missing: "This page has no <h2> section headings." };
    }
    case "canonical":
      return page.canonicalUrl
        ? { location: "<head>", language: "html", current: [`<link rel="canonical" href="${attr(page.canonicalUrl)}" />`], missing: null }
        : { location: "<head>", language: "html", current: [], missing: "This page declares no canonical URL." };
    case "images": {
      const missingAlt = (evidence?.images ?? []).filter((image) => !image.decorative && !image.alt?.trim());
      const current = missingAlt.slice(0, MAX_LINES).map((image) => `<img src="${attr(image.src)}" />`);
      if (missingAlt.length > MAX_LINES) current.push(`<!-- and ${missingAlt.length - MAX_LINES} more images without alt -->`);
      return current.length > 0
        ? { location: "<body>", language: "html", current, missing: null }
        : {
            location: "<body>",
            language: "html",
            current: [],
            missing:
              (page.missingAlt ?? 0) > 0
                ? `${page.missingAlt} images have no alt attribute. This page had a Standard crawl, so their addresses were not kept.`
                : "Every image on this page has alt text.",
          };
    }
    case "links": {
      const internal = (evidence?.links ?? []).filter((link) => link.internal);
      return internal.length > 0
        ? {
            location: "<body>",
            language: "html",
            current: internal.slice(0, MAX_LINES).map((link) => `<a href="${attr(link.href)}">${text(link.anchor || "")}</a>`),
            missing: null,
          }
        : { location: "<body>", language: "html", current: [], missing: "This page links to no other page of your site." };
    }
    case "words": {
      const excerpt = (page.content ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      return {
        location: "<main>",
        language: "html",
        current: excerpt ? [`<!-- ${page.wordCount ?? 0} words of body text -->`, `<p>${text(excerpt)}${(page.content ?? "").length > 240 ? "…" : ""}</p>`] : [],
        missing: excerpt ? null : `The page has ${page.wordCount ?? 0} words of body text.`,
      };
    }
    case "schema": {
      const blocks = (evidence?.schema ?? []).filter((block) => block.valid && block.data);
      if (blocks.length > 0) {
        const json = JSON.stringify(blocks[0].data, null, 2).split("\n");
        return {
          location: "<head>",
          language: "html",
          current: [
            '<script type="application/ld+json">',
            ...json.slice(0, 24),
            ...(json.length > 24 ? ["  …"] : []),
            "</script>",
            ...(blocks.length > 1 ? [`<!-- and ${blocks.length - 1} more JSON-LD blocks -->`] : []),
          ],
          missing: null,
        };
      }
      return {
        location: "<head>",
        language: "html",
        current: [],
        missing:
          (page.schemaCount ?? 0) > 0
            ? "This page's JSON-LD could not be parsed."
            : "You don't have structured data (JSON-LD) on this page.",
      };
    }
    case "indexability": {
      const current = [
        ...(page.robotsMeta ? [`<meta name="robots" content="${attr(page.robotsMeta)}" />`] : []),
        ...(page.xRobotsTag ? [`<!-- HTTP header: X-Robots-Tag: ${page.xRobotsTag} -->`] : []),
        ...(page.inSitemap != null ? [`<!-- ${page.inSitemap ? "Listed" : "Not listed"} in your sitemap -->`] : []),
      ];
      return { location: "<head>", language: "html", current, missing: current.length ? null : "No robots directive on this page." };
    }
    case "robots":
      return {
        location: "/robots.txt",
        language: "text",
        current: page.robotsOk ? [`# ${page.robotsTxtUrl ?? "/robots.txt"} answered`] : [],
        missing: page.robotsOk ? null : `${page.robotsTxtUrl ?? "/robots.txt"} could not be fetched.`,
      };
    case "sitemap":
      return page.hasSitemap && page.sitemapUrl
        ? { location: "/robots.txt", language: "text", current: [`Sitemap: ${page.sitemapUrl}`], missing: null }
        : { location: "/robots.txt", language: "text", current: [], missing: "robots.txt lists no sitemap." };
    case "status":
      return {
        location: "HTTP response",
        language: "http",
        current: [
          `GET ${address}`,
          page.statusCode == null ? "(no response)" : `HTTP/1.1 ${page.statusCode}`,
          ...(page.finalUrl && page.finalUrl !== page.url ? [`# redirected from ${page.url}`] : []),
        ],
        missing: null,
      };
  }
}

/** A stored AI result as fix options the editor can show. */
function toResult(result: FeatureResult): InspectorResult {
  const base = {
    feature: result.feature,
    createdAt: result.createdAt.toISOString(),
  };
  if (!result.data) {
    return {
      ...base,
      ok: false,
      error: friendlyAiError(result.error),
      confidence: null,
      needsHumanReview: false,
      sources: 0,
      diagnosis: null,
      options: [],
      notes: [],
    };
  }
  const meta = result.data as { confidence: string; needsHumanReview: boolean; groundedIn: string[] };
  let options: FixOption[] = [];
  let diagnosis: string | null = null;
  const notes: string[] = [];
  switch (result.feature) {
    case "title":
    case "meta":
    case "heading": {
      const data = result.data as TitleSuggestion | MetaSuggestion | HeadingSuggestion;
      diagnosis = data.diagnosis;
      options = data.suggestions.map((suggestion, index) => ({
        label: `Option ${index + 1}`,
        lines: [TAG[result.feature](suggestion.value)],
        note: suggestion.reasoning,
      }));
      break;
    }
    case "schema": {
      const data = result.data as SchemaMarkupSuggestion;
      diagnosis = data.entityReasoning;
      options = [
        {
          label: data.entityType,
          lines: ['<script type="application/ld+json">', ...JSON.stringify(data.jsonLd, null, 2).split("\n"), "</script>"],
          note: data.eligibleFeatures.length ? `Eligible for: ${data.eligibleFeatures.join(", ")}. Eligibility is not a guarantee.` : null,
        },
      ];
      if (data.missingRequiredProperties.length) {
        notes.push(`Fill in before publishing (not in the crawl): ${data.missingRequiredProperties.join(", ")}`);
      }
      break;
    }
    case "content": {
      const data = result.data as ContentSuggestion;
      const outline = data.outline.flatMap((row) => [`<h2>${text(row.heading)}</h2>`, `<!-- ${row.purpose} -->`]);
      const topics = data.missingTopics.map((row) => `<!-- Cover: ${row.topic}. ${row.why} -->`);
      if (outline.length) options.push({ label: "Outline", lines: outline, note: null });
      if (topics.length) options.push({ label: "Missing topics", lines: topics, note: null });
      for (const row of data.unclearSections.slice(0, 3)) {
        notes.push(`Unclear: "${row.excerpt}". ${row.improvement}`);
      }
      break;
    }
    case "internal-link": {
      const data = result.data as InternalLinkSuggestion;
      options = [
        {
          label: "Links",
          lines: data.suggestions.flatMap((row) => [`<!-- ${row.placement} -->`, `<a href="${attr(row.targetUrl)}">${text(row.anchorText)}</a>`]),
          note: null,
        },
      ];
      break;
    }
    case "image-alt": {
      const data = result.data as ImageAltSuggestion;
      options = [
        {
          label: "Alt text",
          lines: data.images.map((row) => `<img src="${attr(row.src)}" alt="${attr(row.alt)}" />`),
          note: data.images.some((row) => row.basis === "image")
            ? "Some of this alt text was written from the images themselves. Check each one against its image."
            : "Written from captions, nearby text or filenames: SEO Maker could not see these images. Check each one.",
        },
      ];
      if (data.skipped.length) notes.push(`${data.skipped.length} images were skipped: nothing on the page says what they show.`);
      break;
    }
  }
  return {
    ...base,
    ok: options.length > 0,
    error: options.length > 0 ? null : "The AI found nothing to change here.",
    confidence: meta.confidence,
    needsHumanReview: meta.needsHumanReview,
    sources: meta.groundedIn.length,
    diagnosis,
    options: options.filter((option) => option.lines.length > 0),
    notes,
  };
}

/** The feature that writes a fix for a check, as the fix plan routes it. */
const FEATURE_FOR_CHECK: Partial<Record<CheckId, FixFeature>> = {
  title: "title",
  meta: "meta",
  h1: "heading",
  h2: "content",
  words: "content",
  links: "internal-link",
  schema: "schema",
  images: "image-alt",
};

export function inspectPage({
  page,
  plan,
  recommendation,
  features,
  aiAllowed,
}: {
  page: Page & { issues: PageIssue[] };
  plan: PlannedFix[];
  recommendation: PageRecommendation | null;
  features: Map<string, FeatureResult>;
  aiAllowed: boolean;
}): InspectorCheck[] {
  const crawled = isCrawled(page);
  const byCheck = new Map(page.issues.map((issue) => [issue.checkId, issue]));
  const planned = new Map(plan.map((fix) => [fix.checkId, fix]));
  const explained = new Map((recommendation?.recommendations ?? []).map((row) => [row.checkId, row]));

  const rows = checks.map((check): InspectorCheck => {
    const issue = byCheck.get(check.id) ?? null;
    const observed = checkValue(page, check.id);
    const fix = planned.get(check.id) ?? null;
    const why = explained.get(check.id) ?? null;
    // Title and description can be rewritten on request even when they pass.
    const optional = !issue && crawled && aiAllowed && (check.id === "title" || check.id === "meta");
    const feature = fix?.feature ?? (optional ? FEATURE_FOR_CHECK[check.id] ?? null : null);
    const stored = feature ? features.get(feature) : undefined;
    return {
      id: check.id,
      label: check.label,
      hint: check.hint,
      status: issue ? (issue.status === "fail" ? "fail" : "warning") : crawled ? "pass" : "pending",
      severity: issue?.severity ?? null,
      observed: observed.value,
      detail: observed.detail ?? null,
      evidence: issue?.evidence ?? null,
      recommendation: issue?.recommendation ?? null,
      optional,
      why: why ? { issue: why.issue, whyItMatters: why.whyItMatters, action: why.action, actionable: why.actionable } : null,
      fix: fix
        ? {
            strategy: fix.strategy,
            feature: fix.feature,
            reason: fix.reason,
            fromCrawl: fix.fix
              ? { label: fix.fix.label, lines: fix.fix.value.split("\n"), note: null }
              : null,
          }
        : optional
          ? { strategy: "ai-generate", feature, reason: "Rewritten from the page's own heading and text, on request.", fromCrawl: null }
          : null,
      code: currentCode(page, check.id),
      result: stored ? toResult(stored) : null,
    };
  });

  return rows.sort(
    (a, b) =>
      (a.severity ? (SEVERITY_ORDER[a.severity] ?? 4) : 9) - (b.severity ? (SEVERITY_ORDER[b.severity] ?? 4) : 9),
  );
}
