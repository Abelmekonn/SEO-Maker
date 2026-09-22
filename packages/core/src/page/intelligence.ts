/**
 * Page Intelligence (Phase 0.2 / architecture §5).
 *
 * The normalized representation of one crawled page. Every AI feature reads
 * this shape instead of assembling raw Prisma columns, and the crawler is the
 * only thing that writes it.
 *
 * These live in `core` rather than the worker because the web app reads them
 * back out of JSON columns and needs the same types.
 */

/** Hard ceilings so one enormous page cannot bloat a row or a prompt. */
export const CONTENT_MAX_CHARS = 40_000;
export const MAX_STORED_LINKS = 300;
export const MAX_STORED_IMAGES = 120;
export const MAX_STORED_HEADINGS = 80;
export const MAX_STORED_SCHEMA_BYTES = 60_000;

export type HeadingEvidence = {
  level: 2 | 3;
  text: string;
};

export type LinkEvidence = {
  /** Normalized absolute target. */
  href: string;
  anchor: string;
  internal: boolean;
  /** `rel` tokens, lower-cased. */
  rel: string[];
  /** True when the anchor is an image or otherwise has no text. */
  empty: boolean;
};

/**
 * Image evidence.
 *
 * Architecture §5 and Phase 0.3 are explicit that `imageCount` + `missingAlt`
 * cannot ground alt-text generation. `context` carries the caption or nearby
 * text so a later AI feature has something real to work from — and when it is
 * empty the product must ask for human review rather than invent a
 * description.
 */
export type ImageEvidence = {
  src: string;
  alt: string | null;
  /** Alt attribute present but empty, i.e. explicitly decorative. */
  decorative: boolean;
  title: string | null;
  width: number | null;
  height: number | null;
  loading: string | null;
  /** Filename without extension, when it carries meaning. */
  filename: string | null;
  /** Caption or surrounding text, capped. Empty string when none was found. */
  context: string;
};

export type SchemaEvidence = {
  /** `@type` values found in the block. */
  types: string[];
  /** The parsed JSON-LD, or null when the block did not parse. */
  data: unknown;
  valid: boolean;
  error: string | null;
};

export type RedirectHop = {
  from: string;
  to: string;
  status: number;
};

export type PageEvidence = {
  headings: HeadingEvidence[];
  links: LinkEvidence[];
  images: ImageEvidence[];
  schema: SchemaEvidence[];
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  redirectChain: RedirectHop[];
};

/**
 * Elements whose text is never page content. Remove these before reading text.
 *
 * The old crawler called `$("body").text()`, which in Cheerio includes the
 * contents of `<script>` and `<style>`. On stripe.com that reported 10,157
 * words against 1,555 of real copy — a 6.5x inflation that silently disabled
 * the thin-content check for every page on every site. Stripping these first
 * is the whole fix.
 */
export const NON_CONTENT_SELECTOR =
  "script, style, noscript, template, svg, iframe, object, canvas";

export function normalizeContent(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, CONTENT_MAX_CHARS);
}

export function countWords(content: string): number {
  if (!content) {
    return 0;
  }
  return content.split(" ").filter(Boolean).length;
}

/** Stable hash of page content, used to detect "did this page actually change". */
export function contentFingerprint(content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + code, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

export const EMPTY_EVIDENCE: PageEvidence = {
  headings: [],
  links: [],
  images: [],
  schema: [],
  openGraph: {},
  twitter: {},
  redirectChain: [],
};

/** Reads a JSON column back into `PageEvidence` without trusting its shape. */
export function readEvidence(value: unknown): PageEvidence {
  if (!value || typeof value !== "object") {
    return EMPTY_EVIDENCE;
  }
  const raw = value as Partial<PageEvidence>;
  return {
    headings: Array.isArray(raw.headings) ? raw.headings : [],
    links: Array.isArray(raw.links) ? raw.links : [],
    images: Array.isArray(raw.images) ? raw.images : [],
    schema: Array.isArray(raw.schema) ? raw.schema : [],
    openGraph: raw.openGraph && typeof raw.openGraph === "object" ? raw.openGraph : {},
    twitter: raw.twitter && typeof raw.twitter === "object" ? raw.twitter : {},
    redirectChain: Array.isArray(raw.redirectChain) ? raw.redirectChain : [],
  };
}

/**
 * Whether an image has enough evidence for a grounded alt-text suggestion.
 *
 * Phase 0.3 is explicit that a missing-alt count cannot ground alt text. This
 * is the gate that enforces it, so it has to be strict: a caption or real
 * surrounding text, or a filename that reads like words rather than a build
 * hash. When it returns false the only honest output is "a person needs to
 * look at this image" — never a guess at what the image shows.
 */
export function hasAltEvidence(image: ImageEvidence): boolean {
  if (image.context.trim().length >= 25) {
    return true;
  }
  const words = (image.filename ?? "").split(" ").filter((word) => word.length >= 3);
  return words.length >= 2;
}
