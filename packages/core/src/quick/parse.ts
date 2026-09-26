/**
 * Quick Search parsing: the head and the headings of a page, from the part
 * of its HTML that was read.
 *
 * Deliberately not a DOM parser. Quick Search reads the start of a page and
 * needs a dozen tags from it; a tolerant tag scanner does that with no
 * dependency and no full-document work. The full parser (cheerio, in the
 * crawler) is for Deep Analysis.
 */

export type QuickHtml = {
  title: string | null;
  titleCount: number;
  metaDescription: string | null;
  robotsMeta: string | null;
  viewport: string | null;
  charset: string | null;
  lang: string | null;
  canonical: string | null;
  canonicalCount: number;
  hreflangCount: number;
  openGraph: { title: string | null; description: string | null; image: string | null };
  h1: string[];
  h2: string[];
  h3Count: number;
  structuredDataBlocks: number;
  structuredDataTypes: string[];
  imageCount: number;
  imagesWithoutAlt: number;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
  reg: "®",
  trade: "™",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Attributes of one tag, lower-cased names. Handles quoted, unquoted and bare attributes. */
export function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    if (name in attributes) continue;
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function tags(html: string, name: string): Array<Record<string, string>> {
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  return [...html.matchAll(pattern)].map((match) => parseAttributes(match[1]));
}

function schemaTypes(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => schemaTypes(item, depth + 1));
  const record = value as Record<string, unknown>;
  const own = ([] as unknown[]).concat(record["@type"] ?? []).filter((type): type is string => typeof type === "string");
  const graph = Array.isArray(record["@graph"]) ? schemaTypes(record["@graph"], depth + 1) : [];
  return [...own, ...graph];
}

export function parseQuickHtml(html: string): QuickHtml {
  // JSON-LD is read before scripts are stripped.
  const ldBlocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set<string>();
  for (const block of ldBlocks) {
    try {
      for (const type of schemaTypes(JSON.parse(block[1].trim()))) types.add(type);
    } catch {
      // An unparseable block still counts as a block; the Deep Analysis reports it.
    }
  }

  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ");

  const titles = [...body.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((match) => clean(match[1]));
  const metas = tags(body, "meta");
  const meta = (key: string, value: string) =>
    metas.find((attributes) => (attributes[key] ?? "").toLowerCase() === value)?.content ?? null;
  const links = tags(body, "link");
  const canonicals = links.filter((attributes) => (attributes.rel ?? "").toLowerCase().split(/\s+/).includes("canonical"));
  const html0 = tags(body, "html")[0] ?? {};
  const images = tags(body, "img");

  const headings = (level: number) =>
    [...body.matchAll(new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)<\\/h${level}>`, "gi"))].map((match) => clean(match[1]));

  const description = meta("name", "description");
  const robots = [meta("name", "robots"), meta("name", "googlebot")].filter(Boolean).join(", ");

  return {
    title: titles[0] || null,
    titleCount: titles.length,
    metaDescription: description ? description.replace(/\s+/g, " ").trim() : null,
    robotsMeta: robots ? robots.toLowerCase() : null,
    viewport: meta("name", "viewport"),
    charset: metas.find((attributes) => "charset" in attributes)?.charset ?? null,
    lang: html0.lang?.trim() || null,
    canonical: canonicals[0]?.href?.trim() || null,
    canonicalCount: canonicals.length,
    hreflangCount: links.filter((attributes) => "hreflang" in attributes).length,
    openGraph: {
      title: meta("property", "og:title"),
      description: meta("property", "og:description"),
      image: meta("property", "og:image"),
    },
    h1: headings(1).filter(Boolean),
    h2: headings(2).filter(Boolean),
    h3Count: headings(3).filter(Boolean).length,
    structuredDataBlocks: ldBlocks.length,
    structuredDataTypes: [...types].slice(0, 12),
    imageCount: images.length,
    imagesWithoutAlt: images.filter((attributes) => !("alt" in attributes)).length,
  };
}
