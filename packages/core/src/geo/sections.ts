/**
 * Slicing a page into sections.
 *
 * `Page.content` is flat whitespace-collapsed text and `PageEvidence.headings`
 * are the H2/H3 strings in document order. Locating each heading inside the
 * content and cutting between consecutive matches reconstructs the section
 * structure without re-fetching or re-parsing the HTML.
 *
 * Several GEO measurements need sections rather than a word count: whether a
 * section opens with an answer, whether sections are a reasonable size to quote,
 * and whether two answer terms appear near each other rather than at opposite
 * ends of a page.
 */

import type { HeadingEvidence } from "../page/intelligence";
import { normalizeForMatch } from "./text";

export type Section = {
  /** Null for the text before the first heading. */
  heading: string | null;
  level: 2 | 3 | null;
  text: string;
  wordCount: number;
  start: number;
  end: number;
};

function words(text: string): number {
  return text.split(" ").filter(Boolean).length;
}

/**
 * Cuts `content` at each heading, in order.
 *
 * A heading that cannot be found in the content is skipped rather than guessed
 * at — that happens when the heading lives inside an element the extractor
 * strips, and inventing a boundary there would fabricate a section.
 */
export function sectionSpans(
  content: string | null | undefined,
  headings: HeadingEvidence[],
): Section[] {
  if (!content) return [];

  const haystack = normalizeForMatch(content);
  const marks: Array<{ heading: string; level: 2 | 3; at: number; length: number }> = [];

  let cursor = 0;
  for (const heading of headings) {
    const needle = normalizeForMatch(heading.text ?? "");
    if (needle.length < 3) continue;
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) continue;
    marks.push({ heading: heading.text, level: heading.level, at, length: needle.length });
    cursor = at + needle.length;
  }

  const sections: Section[] = [];
  const firstMark = marks[0];

  // Text before the first heading is a real section — on most homepages it is
  // the most important one, so it cannot be dropped.
  const introEnd = firstMark ? firstMark.at : content.length;
  const intro = content.slice(0, introEnd).trim();
  if (intro.length > 0) {
    sections.push({
      heading: null,
      level: null,
      text: intro,
      wordCount: words(intro),
      start: 0,
      end: introEnd,
    });
  }

  for (let index = 0; index < marks.length; index += 1) {
    const mark = marks[index]!;
    const start = mark.at + mark.length;
    const end = marks[index + 1]?.at ?? content.length;
    const text = content.slice(start, end).trim();
    sections.push({
      heading: mark.heading,
      level: mark.level,
      text,
      wordCount: words(text),
      start,
      end,
    });
  }

  return sections;
}

/**
 * The opening paragraph, capped.
 *
 * Used as the highest-value slice of a page when packing evidence into a prompt
 * under a token budget.
 */
export function leadParagraph(content: string | null | undefined, maxChars = 600): string {
  if (!content) return "";
  return content.slice(0, maxChars).trim();
}

/**
 * The first sentence of a section, for the answer-first check.
 *
 * Splits on sentence punctuation followed by a capital letter, which survives
 * the whitespace collapsing that `Page.content` has already been through.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^.*?[.!?](?=\s+[A-Z"'(]|$)/);
  return (match?.[0] ?? trimmed).trim();
}

/**
 * Whether a section opens with a direct answer rather than a wind-up.
 *
 * A declarative 8-60 word opening sentence that does not end in a colon is the
 * shape an extractive system can lift. Grounded in
 * `geo-heuristic-answer-first-structure`, which is a heuristic in the corpus —
 * not an authoritative claim, and the copy must not present it as one.
 */
export function opensWithAnswer(text: string, window = 250): boolean {
  const opening = text.slice(0, window);
  const sentence = firstSentence(opening);
  if (!sentence || sentence.endsWith(":")) return false;
  const count = words(sentence);
  return count >= 8 && count <= 60;
}
