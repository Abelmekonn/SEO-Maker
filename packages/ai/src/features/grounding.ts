/**
 * Grounding checks shared by feature specs and the evaluation benchmark.
 *
 * A number is the easiest thing for a model to invent and the hardest for a
 * reader to doubt: "fix 40 pages" reads as fact. So any number in generated
 * text must already appear in the evidence it was given.
 */

/** Numbers in `text`, with thousands separators removed ("1,555" -> "1555"). */
export function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  // A comma counts only as a thousands separator ("1,555"), never as the
  // comma in a list ("3, 4").
  for (const match of text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    found.add(match[0].replace(/,/g, "").replace(/\.0+$/, ""));
  }
  return found;
}

/**
 * Numbers in `text` that `evidence` does not contain. "1" is allowed freely:
 * it is how prose says "a" ("add 1 link from each page"), not a count.
 */
export function ungroundedNumbers(text: string, evidence: string | Set<string>): string[] {
  const allowed = typeof evidence === "string" ? numbersIn(evidence) : evidence;
  return [...numbersIn(text)].filter((number) => number !== "1" && number !== "0" && !allowed.has(number));
}
