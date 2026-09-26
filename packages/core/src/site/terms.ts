/**
 * Word-level text features for website retrieval (Phase 3.5).
 *
 * Deliberately lexical. Two pages share a topic when the words in their titles,
 * H1s and headings overlap. The plan defers embeddings until the corpus
 * justifies them (Phase 4.8); this is the metadata-first retrieval that comes
 * before, and every match it makes can be shown to the user as the words that
 * produced it.
 */

/**
 * Words that carry no topic. English function words, plus the web boilerplate
 * that appears in navigation and calls to action on every site.
 */
const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "can", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i",
  "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more", "most", "my", "no", "nor",
  "not", "now", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "out", "over", "own",
  "same", "she", "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them",
  "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up",
  "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why", "will",
  "with", "would", "you", "your", "yours", "yourself", "us", "via", "per", "within", "without",
  // Web boilerplate.
  "home", "homepage", "page", "pages", "welcome", "official", "site", "website", "online", "click",
  "read", "learn", "get", "started", "start", "new", "now", "today", "free", "best", "top", "sign",
  "log", "login", "contact", "menu", "search", "skip", "content", "main", "next", "previous", "back",
  "view", "see", "find", "go", "use", "using", "make", "way", "ways", "one", "two", "three",
]);

/** Undoes the commonest English plural so "payments" and "payment" match. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("ses")) return word.slice(0, -2);
  // "saas" and "paas" are not plurals.
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("aas")) {
    return word.slice(0, -1);
  }
  return word;
}

/** Topic-bearing words in `text`, lower-cased and lightly stemmed, in order. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
    .map(stem);
}

export function termSet(...texts: Array<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const text of texts) {
    for (const word of tokenize(text)) set.add(word);
  }
  return set;
}

/** Jaccard overlap, 0..1. */
export function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** Share of `query`'s words that appear in `doc`, 0..1. */
export function containment(query: ReadonlySet<string>, doc: ReadonlySet<string>): number {
  if (query.size === 0) return 0;
  let found = 0;
  for (const word of query) if (doc.has(word)) found += 1;
  return found / query.size;
}

export function sharedTerms(a: ReadonlySet<string>, b: ReadonlySet<string>): string[] {
  return [...a].filter((word) => b.has(word)).sort();
}

/** Exact-duplicate key: case and whitespace do not make two titles different. */
export function normalizeText(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The part of a title that names the page, without the brand suffix.
 * "Payments | Stripe" -> "Payments". Only a trailing segment after a separator
 * is dropped, so a title with no separator is returned unchanged.
 */
export function titleTopic(title: string | null | undefined): string {
  const text = (title ?? "").trim();
  const parts = text.split(/\s+[|–—·•:-]\s+/);
  return (parts.length > 1 ? parts.slice(0, -1).join(" - ") : text).trim();
}
