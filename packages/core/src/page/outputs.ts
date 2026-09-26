/**
 * Page AI outputs: what a user can ask the AI for on one page.
 *
 *   analysis          problem identification: every failing check, explained
 *   metadata          title and meta description
 *   content           missing topics, outline, unclear passages
 *   headings          the top-level heading
 *   schema            JSON-LD for the page's type
 *   alt-text          alt text for images without it
 *   internal-links    links to other pages of the site
 *
 * These are outputs of one capability (Page AI), not separate AI systems:
 * each maps onto one or two grounded features the worker runs.
 *
 * Each output needs evidence the crawl may not have. `pageOutputAvailability`
 * says, before anything is queued or charged, whether it can be written from
 * this page's evidence and, if not, what is missing. The rules match the fix
 * plan's, so the Fixes list and the AI workspace never disagree.
 */

import type { FixFeature, FixPlanInput } from "./fix-plan";

export type PageAiOutput = "analysis" | "metadata" | "content" | "headings" | "schema" | "alt-text" | "internal-links";

export const PAGE_AI_OUTPUTS: readonly PageAiOutput[] = [
  "analysis",
  "metadata",
  "content",
  "headings",
  "schema",
  "alt-text",
  "internal-links",
];

/** The worker features that produce each output. */
export const PAGE_OUTPUT_FEATURES: Record<PageAiOutput, Array<FixFeature | "page-recommendation">> = {
  analysis: ["page-recommendation"],
  metadata: ["title", "meta"],
  content: ["content"],
  headings: ["heading"],
  schema: ["schema"],
  "alt-text": ["image-alt"],
  "internal-links": ["internal-link"],
};

export const PAGE_OUTPUT_LABELS: Record<PageAiOutput, string> = {
  analysis: "Page analysis",
  metadata: "Metadata",
  content: "Content",
  headings: "Headings",
  schema: "Structured data",
  "alt-text": "Image alt text",
  "internal-links": "Internal links",
};

export type OutputAvailability = { available: boolean; reason: string };

/** Enough text to write from without guessing. Matches the fix plan. */
const MIN_CHARS_FOR_COPY = 200;
const MIN_TYPE_CONFIDENCE_FOR_SCHEMA = 0.6;
const MIN_LINK_TARGETS = 3;

function standardNote(input: FixPlanInput): string {
  return input.crawlTier === "standard"
    ? "This page had a Standard Crawl, which keeps no page text. Make it a Priority page to fetch its full content first."
    : "No page text was captured for this page.";
}

/** Whether each output can be written from this page's evidence, and why not. */
export function pageOutputAvailability(input: FixPlanInput): Record<PageAiOutput, OutputAvailability> {
  const text = input.contentLength;
  const failing = input.failing.length;
  const typeKnown =
    Boolean(input.pageType) &&
    input.pageType !== "other" &&
    (input.pageTypeScore ?? 0) >= MIN_TYPE_CONFIDENCE_FOR_SCHEMA;
  const missingAlt = input.missingAlt ?? 0;
  const viewable = input.viewableMissingAlt ?? 0;

  return {
    analysis:
      failing > 0
        ? { available: true, reason: `Explains the ${failing} failing ${failing === 1 ? "check" : "checks"} on this page.` }
        : { available: false, reason: "Every check passes on this page, so there is nothing to explain." },

    metadata:
      text > 0 || input.h1
        ? { available: true, reason: "Written from the page's own heading and text." }
        : { available: false, reason: standardNote(input) },

    content:
      text > 0
        ? { available: true, reason: "Based on what the page already says." }
        : { available: false, reason: standardNote(input) },

    headings:
      text >= MIN_CHARS_FOR_COPY
        ? { available: true, reason: "Written from the page's own text and headings." }
        : { available: false, reason: text > 0 ? "Too little page text was captured to say what the page is about." : standardNote(input) },

    schema: typeKnown
      ? { available: true, reason: `The page is classified as ${input.pageType}, so its schema.org type is known.` }
      : {
          available: false,
          reason: `The page type is uncertain (${input.pageType ?? "unknown"}). Set the page type first so the right schema.org type is known.`,
        },

    "alt-text":
      missingAlt === 0
        ? { available: false, reason: "Every image on this page has alt text or is marked decorative." }
        : viewable > 0
          ? { available: true, reason: `${viewable} of ${missingAlt} images without alt text can be shown to the AI.` }
          : input.describableMissingAlt > 0
            ? {
                available: true,
                reason: `${input.describableMissingAlt} of ${missingAlt} images carry a caption, nearby text or a filename to write from.`,
              }
            : {
                available: false,
                reason:
                  input.crawlTier === "standard"
                    ? standardNote(input)
                    : `None of the ${missingAlt} images without alt text can be described from the evidence. A person needs to write these.`,
              },

    "internal-links":
      text === 0
        ? { available: false, reason: standardNote(input) }
        : input.knownUrlCount >= MIN_LINK_TARGETS
          ? { available: true, reason: "Targets are limited to pages the crawl actually found." }
          : {
              available: false,
              reason: `The crawl found ${input.knownUrlCount} other ${input.knownUrlCount === 1 ? "page" : "pages"} to link to; at least ${MIN_LINK_TARGETS} are needed for real suggestions.`,
            },
  };
}

/** The worker features for a set of requested outputs, without duplicates. */
export function featuresForOutputs(outputs: PageAiOutput[]): Array<FixFeature | "page-recommendation"> {
  return [...new Set(outputs.flatMap((output) => PAGE_OUTPUT_FEATURES[output]))];
}

export function isPageAiOutput(value: unknown): value is PageAiOutput {
  return typeof value === "string" && (PAGE_AI_OUTPUTS as readonly string[]).includes(value);
}
