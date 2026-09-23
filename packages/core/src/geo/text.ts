/**
 * Text normalization shared by every GEO measurement.
 *
 * Deliberately lexical: stems and multiword phrases, no embeddings and no model
 * call. That is what makes Answer Coverage reproducible — re-running the matcher
 * over stored terms gives the same score without touching a provider.
 *
 * "Semantic" here means the matcher tolerates inflection and word order, so
 * "emergency plumbing repairs" matches "we repair emergency plumbing". It does
 * not mean exact-wording matching, which would fail that case.
 */

/** Function words that carry no topical signal. Kept small on purpose. */
export const STOPWORDS = new Set([
  "a", "about", "all", "also", "an", "and", "any", "are", "as", "at", "be",
  "been", "but", "by", "can", "do", "does", "for", "from", "get", "had", "has",
  "have", "how", "i", "if", "in", "into", "is", "it", "its", "just", "may",
  "more", "most", "my", "no", "not", "of", "on", "one", "or", "our", "out",
  "over", "own", "should", "so", "some", "such", "than", "that", "the", "their",
  "them", "then", "there", "these", "they", "this", "those", "through", "to",
  "up", "us", "use", "very", "was", "we", "were", "what", "when", "where",
  "which", "while", "who", "why", "will", "with", "would", "you", "your",
]);

/**
 * Suffix stripping, not a real stemmer.
 *
 * A full Porter stemmer would conflate "services" and "serving", which is wrong
 * for a product that reports which service pages exist. This handles plurals and
 * the common verb endings and stops there. Words under 4 characters are left
 * alone so "is" and "ads" survive intact.
 */
export function lightStem(word: string): string {
  if (word.length < 4) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  // "classes" -> "class". Handled before the plain -s rule, which would
  // otherwise leave "classe".
  if (word.endsWith("sses")) return word.slice(0, -2);
  // No general -es rule: it turns "services" into "servic", which then fails to
  // match the singular "service" the site actually uses. The plain -s rule
  // below gets that case right.
  //
  // -is and -us are almost never English plurals, and stripping them mangles
  // exactly the proper nouns a business profile is built from ("Addis" ->
  // "addi", "campus" -> "campu").
  if (word.endsWith("s") && !word.endsWith("ss") && !/[isu]s$/.test(word)) {
    return word.slice(0, -1);
  }
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  return word;
}

/** Lowercased, punctuation-stripped, stopword-free, stemmed tokens in order. */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .split(/[^a-z0-9'+]+/)
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter((word) => word.length > 0 && !STOPWORDS.has(word))
    .map(lightStem);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** Intersection over union. Returns 0 when either side is empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Mean pairwise Jaccard. Null below two inputs — one description cannot disagree. */
export function meanPairwiseJaccard(texts: string[]): number | null {
  const sets = texts.map(tokenSet).filter((set) => set.size > 0);
  if (sets.length < 2) return null;

  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      total += jaccard(sets[i]!, sets[j]!);
      pairs += 1;
    }
  }
  return pairs === 0 ? null : total / pairs;
}

/**
 * Collapses whitespace and case for substring checks.
 *
 * Used to verify that a claim the model reported is genuinely on the page.
 * Punctuation is kept: dropping it would let a reworded claim pass.
 */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Whether `needle` appears literally in `haystack`.
 *
 * This is the zero-hallucination gate. A quoted claim that fails it is dropped
 * before it can reach a database column or a screen, so those columns cannot
 * hold an invention even if the model produces one.
 */
export function containsVerbatim(haystack: string, needle: string): boolean {
  const target = normalizeForMatch(needle);
  if (target.length < 8) return false;
  return normalizeForMatch(haystack).includes(target);
}

/**
 * Whether a multiword term is present within a bounded window.
 *
 * Order-insensitive on purpose. Real copy reorders concepts constantly: a page
 * selling "emergency plumbing repairs" writes "we repair emergency plumbing".
 * Requiring document order would miss that and collapse into the exact-wording
 * matching this module exists to avoid.
 *
 * The window is what keeps it honest — every stem of the term has to appear
 * close together, so a page that happens to mention "emergency" in a banner and
 * "plumbing" three sections later does not count as covering the term.
 */
export function containsPhrase(haystackTokens: string[], term: string, slack = 4): boolean {
  const needle = [...new Set(tokenize(term))];
  if (needle.length === 0) return false;
  if (needle.length === 1) return haystackTokens.includes(needle[0]!);

  const window = needle.length + slack;
  const needed = new Set(needle);

  // Slide a window over the text and ask whether it holds every stem.
  for (let start = 0; start + needle.length <= haystackTokens.length; start += 1) {
    const seen = new Set<string>();
    const stop = Math.min(start + window, haystackTokens.length);
    for (let index = start; index < stop; index += 1) {
      const token = haystackTokens[index]!;
      if (needed.has(token)) seen.add(token);
      if (seen.size === needed.size) return true;
    }
  }
  return false;
}
