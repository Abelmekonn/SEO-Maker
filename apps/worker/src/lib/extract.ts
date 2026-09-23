import {
  type ImageEvidence,
  type LinkEvidence,
  MAX_STORED_HEADINGS,
  MAX_STORED_IMAGES,
  MAX_STORED_LINKS,
  MAX_STORED_SCHEMA_BYTES,
  NON_CONTENT_SELECTOR,
  type PageEvidence,
  type PageStructure,
  type SchemaEvidence,
  countWords,
  normalizeContent,
} from "@seo-maker/core/page";
import { hostKey, toAbsoluteUrl } from "@seo-maker/core/crawl";
import type { CheerioCrawlingContext } from "crawlee";

/**
 * Turns one fetched HTML document into Page Intelligence (Phase 0.2).
 *
 * The old crawler kept counts only — `h2Count`, `imageCount`, `missingAlt`,
 * `schemaCount` — and threw the page away. Nothing downstream could then
 * recommend anything specific, because the evidence no longer existed.
 */

/** Cheerio's API as crawlee hands it to us, without depending on cheerio directly. */
type CheerioApi = CheerioCrawlingContext["$"];

const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

export type ExtractedPage = {
  title: string | null;
  metaDesc: string | null;
  h1: string | null;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  canonicalUrl: string | null;
  robotsMeta: string | null;
  language: string | null;
  content: string;
  wordCount: number;
  imageCount: number;
  missingAlt: number;
  internalLinks: number;
  externalLinks: number;
  schemaCount: number;
  schemaTypes: string[];
  evidence: PageEvidence;
};

export function extractPage($: CheerioApi, loadedUrl: string): ExtractedPage {
  const loaded = new URL(loadedUrl);
  const originHost = hostKey(loaded.hostname);

  const title = clean($("title").first().text());
  const metaDesc = clean(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content"),
  );
  const canonicalRaw = clean($('link[rel="canonical"]').attr("href"));
  const robotsMeta = clean(
    $('meta[name="robots"]').attr("content") ?? $('meta[name="googlebot"]').attr("content"),
  ).toLowerCase();
  const language =
    clean($("html").attr("lang")) ||
    clean($('meta[http-equiv="content-language"]').attr("content")) ||
    null;

  const h1Nodes = $("h1").toArray();
  const h1Text = clean($(h1Nodes[0]).text());
  const h1Count = h1Nodes.length;
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;

  const headings: PageEvidence["headings"] = [];
  for (const node of $("h2").toArray().slice(0, MAX_STORED_HEADINGS)) {
    const text = clean($(node).text());
    if (text) {
      headings.push({ level: 2, text: text.slice(0, 300) });
    }
  }
  for (const node of $("h3").toArray().slice(0, MAX_STORED_HEADINGS)) {
    const text = clean($(node).text());
    if (text) {
      headings.push({ level: 3, text: text.slice(0, 300) });
    }
  }

  const links = extractLinks($, loadedUrl, originHost);
  const images = extractImages($, loadedUrl);
  const schema = extractSchema($);
  const openGraph = extractMetaPrefix($, "og:");
  const twitter = extractMetaPrefix($, "twitter:");

  // Structure has to be read before the removal below too: <noscript> is in
  // NON_CONTENT_SELECTOR, so counting its text afterwards would always be zero.
  const htmlLength = ($.html() ?? "").length;
  const structure = extractStructure($, headings);

  // Read text last: this mutates the document by removing script/style, and
  // every field above must be taken from the intact page. Heading text in
  // particular: an <h1> holding only an inline SVG logo carries its accessible
  // name inside that SVG, and reading it after the removal would report the
  // page as having no H1 at all.
  $(NON_CONTENT_SELECTOR).remove();
  const content = normalizeContent($("body").text());

  structure.textToHtmlRatio = htmlLength > 0 ? content.length / htmlLength : 0;

  const schemaTypes = [...new Set(schema.flatMap((block) => block.types))];

  return {
    title: title || null,
    metaDesc: metaDesc || null,
    h1: h1Text || null,
    h1Count,
    h2Count,
    h3Count,
    canonicalUrl: canonicalRaw ? toAbsoluteUrl(canonicalRaw, loadedUrl) : null,
    robotsMeta: robotsMeta || null,
    language,
    content,
    wordCount: countWords(content),
    imageCount: images.total,
    missingAlt: images.missingAlt,
    internalLinks: links.internal,
    externalLinks: links.external,
    schemaCount: schema.length,
    schemaTypes,
    evidence: {
      headings,
      links: links.stored,
      images: images.stored,
      schema,
      openGraph,
      twitter,
      redirectChain: [],
      structure,
    },
  };
}

/**
 * Structural observations for the GEO extractability measurement.
 *
 * Everything here is an observation about what this crawl received. None of it
 * is a judgement, and in particular `textToHtmlRatio` must never be reported as
 * a claim about whether any system can read JavaScript — only as how much
 * server-rendered text arrived.
 *
 * Must be called before NON_CONTENT_SELECTOR is removed.
 */
function extractStructure($: CheerioApi, headings: PageEvidence["headings"]): PageStructure {
  let collapsedRegions = 0;
  // Only count a collapsed container that actually hides prose. A closed
  // <details> holding three words is a UI detail, not buried content.
  for (const node of $(
    "details:not([open]), [aria-expanded='false'], [role='tabpanel'], [hidden]",
  ).toArray()) {
    if (clean($(node).text()).length > 40) {
      collapsedRegions += 1;
    }
  }

  const noscriptChars = $("noscript")
    .toArray()
    .reduce((total, node) => total + clean($(node).text()).length, 0);

  const questionHeadings = headings.filter((heading) => isQuestion(heading.text)).length;

  return {
    hasMain: $("main, [role='main']").length > 0,
    hasArticle: $("article").length > 0,
    hasHeader: $("header, [role='banner']").length > 0,
    hasNav: $("nav, [role='navigation']").length > 0,
    hasFooter: $("footer, [role='contentinfo']").length > 0,
    hasAside: $("aside, [role='complementary']").length > 0,
    collapsedRegions,
    noscriptChars,
    // Filled in by the caller once the content has been read.
    textToHtmlRatio: 0,
    definitionLists: $("dl").length,
    questionHeadings,
  };
}

/** A heading shaped like a question, with or without the question mark. */
function isQuestion(text: string): boolean {
  if (text.trim().endsWith("?")) return true;
  return /^(how|what|why|when|where|who|which|can|do|does|is|are|should|will)\b/i.test(text.trim());
}

function extractLinks($: CheerioApi, base: string, originHost: string) {
  const stored: LinkEvidence[] = [];
  let internal = 0;
  let external = 0;

  for (const node of $("a[href]").toArray()) {
    const element = $(node);
    const href = element.attr("href");
    if (!href) {
      continue;
    }
    const target = toAbsoluteUrl(href, base);
    if (!target) {
      continue;
    }

    let isInternal: boolean;
    try {
      isInternal = hostKey(new URL(target).hostname) === originHost;
    } catch {
      continue;
    }

    if (isInternal) {
      internal += 1;
    } else {
      external += 1;
    }

    if (stored.length < MAX_STORED_LINKS) {
      const anchor = clean(element.text()) || clean(element.find("img").attr("alt"));
      stored.push({
        href: target,
        anchor: anchor.slice(0, 200),
        internal: isInternal,
        rel: clean(element.attr("rel")).toLowerCase().split(" ").filter(Boolean),
        empty: anchor.length === 0,
      });
    }
  }

  return { internal, external, stored };
}

/**
 * Image evidence.
 *
 * `context` is the caption or nearby text. Phase 0.3 forbids generating alt
 * text from a missing-alt count alone, so this is the only thing that can make
 * a later alt suggestion grounded — and when it is empty the honest output is
 * "a human needs to look at this image".
 */
function extractImages($: CheerioApi, base: string) {
  const stored: ImageEvidence[] = [];
  const nodes = $("img").toArray();
  let missingAlt = 0;

  for (const node of nodes) {
    const element = $(node);
    const altAttr = element.attr("alt");
    const hasAltAttr = altAttr != null;
    const alt = clean(altAttr);
    if (!alt) {
      missingAlt += 1;
    }

    if (stored.length >= MAX_STORED_IMAGES) {
      continue;
    }

    const srcRaw = element.attr("src") ?? element.attr("data-src") ?? "";
    let src = srcRaw;
    try {
      src = srcRaw ? new URL(srcRaw, base).toString() : "";
    } catch {
      // Keep the raw value; it is still evidence of what the markup says.
    }

    stored.push({
      src: src.slice(0, 500),
      alt: alt || null,
      decorative: hasAltAttr && alt === "",
      title: clean(element.attr("title")) || null,
      width: toInt(element.attr("width")),
      height: toInt(element.attr("height")),
      loading: clean(element.attr("loading")) || null,
      filename: filenameOf(src),
      context: imageContext($, element).slice(0, 300),
    });
  }

  return { total: nodes.length, missingAlt, stored };
}

function imageContext($: CheerioApi, element: ReturnType<CheerioApi>): string {
  const figure = element.closest("figure");
  if (figure.length > 0) {
    const caption = clean(figure.find("figcaption").first().text());
    if (caption) {
      return caption;
    }
  }
  const aria = clean(element.attr("aria-label"));
  if (aria) {
    return aria;
  }
  const parentText = clean(element.parent().text());
  return parentText;
}

function filenameOf(src: string): string | null {
  if (!src) {
    return null;
  }
  const last = src.split(/[?#]/)[0].split("/").pop() ?? "";
  const words = last
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[-_.\s]+/)
    // Build hashes and dimension suffixes describe the asset, not the picture.
    .filter((word) => word.length >= 2 && !/^[0-9a-f]{6,}$/i.test(word) && !/^\d+x?$/i.test(word))
    .filter(Boolean);

  if (words.length === 0) {
    return null;
  }
  return words.join(" ").slice(0, 120);
}

function extractSchema($: CheerioApi): SchemaEvidence[] {
  const blocks: SchemaEvidence[] = [];
  let budget = MAX_STORED_SCHEMA_BYTES;

  for (const node of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(node).text().trim();
    if (!raw) {
      continue;
    }

    try {
      const data = JSON.parse(raw) as unknown;
      const serialized = JSON.stringify(data);
      const fits = serialized.length <= budget;
      budget -= Math.min(serialized.length, budget);
      blocks.push({
        types: schemaTypesOf(data),
        // Keep the shape even when the payload is too large to store whole.
        data: fits ? data : null,
        valid: true,
        error: fits ? null : "Stored types only: JSON-LD exceeded the size budget.",
      });
    } catch (error) {
      blocks.push({
        types: [],
        data: null,
        valid: false,
        error: error instanceof Error ? error.message.slice(0, 200) : "Invalid JSON-LD",
      });
    }
  }

  return blocks;
}

function schemaTypesOf(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => schemaTypesOf(item, depth + 1));
  }
  if (typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const types: string[] = [];
  const raw = record["@type"];
  if (typeof raw === "string") {
    types.push(raw);
  } else if (Array.isArray(raw)) {
    types.push(...raw.filter((item): item is string => typeof item === "string"));
  }

  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    if (record[key]) {
      types.push(...schemaTypesOf(record[key], depth + 1));
    }
  }

  return types;
}

function extractMetaPrefix($: CheerioApi, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const node of $("meta[property], meta[name]").toArray()) {
    const element = $(node);
    const key = (element.attr("property") ?? element.attr("name") ?? "").toLowerCase();
    if (!key.startsWith(prefix)) {
      continue;
    }
    const value = clean(element.attr("content"));
    if (value) {
      out[key] = value.slice(0, 500);
    }
  }
  return out;
}

function toInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
