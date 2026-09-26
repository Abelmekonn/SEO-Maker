/**
 * Search markets: where a business sells, which search results matter for
 * it, and whether a competitor serves the same market.
 *
 * Nothing here assumes a market. A target location that names no country
 * resolves to none, and the callers ask the user rather than defaulting to
 * the United States.
 */

import type { SignalMeasurement } from "../scoring/confidence";

export type Country = {
  /** ISO 3166-1 alpha-2, lower case. */
  iso2: string;
  /** ISO 3166-1 numeric. */
  numeric: number;
  name: string;
  /** Other names people type, lower case. */
  aliases: string[];
  /** The main language of its search results, ISO 639-1. */
  language: string;
};

// [iso2, numeric, name, aliases, language]
const COUNTRY_ROWS: Array<[string, number, string, string[], string]> = [
  ["us", 840, "United States", ["usa", "united states of america", "america", "u.s.", "u.s.a."], "en"],
  ["gb", 826, "United Kingdom", ["uk", "u.k.", "great britain", "britain", "england", "scotland", "wales"], "en"],
  ["ca", 124, "Canada", [], "en"],
  ["au", 36, "Australia", [], "en"],
  ["nz", 554, "New Zealand", [], "en"],
  ["ie", 372, "Ireland", [], "en"],
  ["de", 276, "Germany", ["deutschland"], "de"],
  ["fr", 250, "France", [], "fr"],
  ["es", 724, "Spain", ["españa", "espana"], "es"],
  ["it", 380, "Italy", ["italia"], "it"],
  ["nl", 528, "Netherlands", ["the netherlands", "holland"], "nl"],
  ["be", 56, "Belgium", [], "nl"],
  ["ch", 756, "Switzerland", [], "de"],
  ["at", 40, "Austria", [], "de"],
  ["pt", 620, "Portugal", [], "pt"],
  ["se", 752, "Sweden", [], "sv"],
  ["no", 578, "Norway", [], "no"],
  ["dk", 208, "Denmark", [], "da"],
  ["fi", 246, "Finland", [], "fi"],
  ["pl", 616, "Poland", [], "pl"],
  ["cz", 203, "Czech Republic", ["czechia"], "cs"],
  ["gr", 300, "Greece", [], "el"],
  ["ro", 642, "Romania", [], "ro"],
  ["hu", 348, "Hungary", [], "hu"],
  ["ua", 804, "Ukraine", [], "uk"],
  ["tr", 792, "Turkey", ["türkiye", "turkiye"], "tr"],
  ["il", 376, "Israel", [], "he"],
  ["ae", 784, "United Arab Emirates", ["uae", "emirates", "dubai"], "en"],
  ["sa", 682, "Saudi Arabia", ["ksa"], "ar"],
  ["qa", 634, "Qatar", [], "ar"],
  ["eg", 818, "Egypt", [], "ar"],
  ["ma", 504, "Morocco", [], "fr"],
  ["et", 231, "Ethiopia", [], "en"],
  ["ke", 404, "Kenya", [], "en"],
  ["ng", 566, "Nigeria", [], "en"],
  ["gh", 288, "Ghana", [], "en"],
  ["za", 710, "South Africa", [], "en"],
  ["ug", 800, "Uganda", [], "en"],
  ["tz", 834, "Tanzania", [], "en"],
  ["rw", 646, "Rwanda", [], "en"],
  ["in", 356, "India", ["bharat"], "en"],
  ["pk", 586, "Pakistan", [], "en"],
  ["bd", 50, "Bangladesh", [], "bn"],
  ["lk", 144, "Sri Lanka", [], "en"],
  ["sg", 702, "Singapore", [], "en"],
  ["my", 458, "Malaysia", [], "en"],
  ["id", 360, "Indonesia", [], "id"],
  ["ph", 608, "Philippines", [], "en"],
  ["th", 764, "Thailand", [], "th"],
  ["vn", 704, "Vietnam", ["viet nam"], "vi"],
  ["jp", 392, "Japan", [], "ja"],
  ["kr", 410, "South Korea", ["korea", "republic of korea"], "ko"],
  ["cn", 156, "China", [], "zh"],
  ["hk", 344, "Hong Kong", [], "zh"],
  ["tw", 158, "Taiwan", [], "zh"],
  ["br", 76, "Brazil", ["brasil"], "pt"],
  ["mx", 484, "Mexico", ["méxico"], "es"],
  ["ar", 32, "Argentina", [], "es"],
  ["cl", 152, "Chile", [], "es"],
  ["co", 170, "Colombia", [], "es"],
  ["pe", 604, "Peru", ["perú"], "es"],
];

export const COUNTRIES: Country[] = COUNTRY_ROWS.map(([iso2, numeric, name, aliases, language]) => ({
  iso2,
  numeric,
  name,
  aliases,
  language,
}));

const BY_ISO2 = new Map(COUNTRIES.map((country) => [country.iso2, country]));

export function countryByIso2(code: string | null | undefined): Country | null {
  if (!code) return null;
  const key = code.trim().toLowerCase();
  return BY_ISO2.get(key === "uk" ? "gb" : key) ?? null;
}

/**
 * Google's location id for a country, as SERP APIs take it. Google's country
 * criteria ids are 2000 plus the ISO numeric code (United States 2840,
 * Ethiopia 2231).
 */
export function serpLocationCode(country: Country): number {
  return 2000 + country.numeric;
}

const GLOBAL_WORDS = /\b(global|globally|worldwide|world wide|international|internationally|everywhere|anywhere|all countries|world)\b/i;

export type MarketScope = "global" | "country" | "unknown";

export type Market = {
  scope: MarketScope;
  /** The country whose search results represent the market. */
  country: Country | null;
  /** What the user wrote. */
  label: string | null;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reads a free-text target location: "Ethiopia", "Addis Ababa, Ethiopia",
 * "UK", "Global (mainly United States)". The first country named wins.
 * Two-letter codes count only as a whole segment, so the word "in" is never
 * read as India.
 */
export function resolveMarket(targetLocation: string | null | undefined): Market {
  const label = targetLocation?.trim() || null;
  if (!label) return { scope: "unknown", country: null, label: null };
  const text = label.toLowerCase();
  const global = GLOBAL_WORDS.test(text);

  let found: { country: Country; index: number } | null = null;
  for (const country of COUNTRIES) {
    for (const name of [country.name.toLowerCase(), ...country.aliases]) {
      const match = new RegExp(`(^|[^\\p{L}])${escapeRegExp(name)}(?=$|[^\\p{L}])`, "u").exec(text);
      if (match && (!found || match.index < found.index)) found = { country, index: match.index };
    }
  }
  if (!found) {
    for (const segment of label.split(/[,;/()|]+/)) {
      const code = segment.trim();
      if (/^[A-Za-z]{2}$/.test(code)) {
        const country = countryByIso2(code);
        if (country) {
          found = { country, index: 0 };
          break;
        }
      }
    }
  }

  if (global) return { scope: "global", country: found?.country ?? null, label };
  return found ? { scope: "country", country: found.country, label } : { scope: "unknown", country: null, label };
}

/** Country-code top-level domains that sites use as generic names. */
const GENERIC_CC_TLDS = new Set(["io", "co", "ai", "me", "tv", "fm", "ly", "gg", "sh", "so", "to", "cc", "ws", "la", "vc"]);

/** The country a host's ccTLD names ("adyen.co.uk" -> gb), or null for .com and generic ccTLDs. */
export function countryFromHost(host: string): Country | null {
  const tld = host.toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";
  if (tld.length !== 2 || GENERIC_CC_TLDS.has(tld)) return null;
  return countryByIso2(tld);
}

/** "en-GB" -> "en". Null for anything that is not a language tag. */
export function primaryLanguage(tag: string | null | undefined): string | null {
  const match = /^\s*([a-z]{2,3})(?:[-_][a-z0-9]+)*\s*$/i.exec(tag ?? "");
  return match ? match[1].toLowerCase() : null;
}

/** "en-GB" -> gb. Null without a region. */
export function languageRegion(tag: string | null | undefined): Country | null {
  const match = /^\s*[a-z]{2,3}[-_]([a-z]{2})\b/i.exec(tag ?? "");
  return match ? countryByIso2(match[1]) : null;
}

/** Most common value, ignoring nulls. */
export function mostCommon(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Where a competitor appears to operate, from its own pages. */
export type CompetitorMarketProfile = {
  country: string | null;
  countrySource: "domain" | "address" | "language-region" | null;
  language: string | null;
  /** Regions its hreflang alternates target: a site that serves many markets. */
  regions: string[];
};

export function competitorMarketProfile(input: {
  host: string;
  pages: Array<{ language: string | null; hreflang: string[]; addressCountries: string[] }>;
}): CompetitorMarketProfile {
  const language = mostCommon(input.pages.map((page) => primaryLanguage(page.language)));
  const regions = [
    ...new Set(input.pages.flatMap((page) => page.hreflang.map((tag) => languageRegion(tag)?.iso2 ?? null)).filter((v): v is string => v != null)),
  ].sort();

  const fromDomain = countryFromHost(input.host);
  if (fromDomain) return { country: fromDomain.iso2, countrySource: "domain", language, regions };
  const address = mostCommon(
    input.pages.flatMap((page) =>
      page.addressCountries.map((value) => countryByIso2(value)?.iso2 ?? resolveMarket(value).country?.iso2 ?? null),
    ),
  );
  if (address) return { country: address, countrySource: "address", language, regions };
  const region = mostCommon(input.pages.map((page) => languageRegion(page.language)?.iso2 ?? null));
  // A site that targets several regions is international: one region tag
  // on it says nothing about a home market.
  if (region && regions.length < 2) return { country: region, countrySource: "language-region", language, regions };
  return { country: null, countrySource: null, language, regions };
}

/** How widely a business sells, which decides how much geography matters. */
export type BusinessScope = "local" | "national" | "global" | "unknown";

export function businessScope(input: { family: string | null; market: Market }): BusinessScope {
  if (input.family === "local-service") return "local";
  if (input.market.scope === "global") return "global";
  if (input.market.scope === "country") return "national";
  return "unknown";
}

/**
 * MARKET OVERLAP, 0..1: whether the competitor serves the market you do.
 *
 *   appears in search results run for your market   -> 1 (observed)
 *   local business      same country 1, elsewhere 0.05 (location decides)
 *   national business   same country 1; an international site in your
 *                       language 0.8, in another 0.2; another country 0.4
 *                       in your language, else 0.1
 *   global business     same language 1; another language 0.3, or 0.6
 *                       when it runs several regional sites
 *
 * A global SaaS never needs the competitor in its own country. Unmeasured
 * when either side's market cannot be read, with the reason.
 */
export function measureMarketOverlap(input: {
  domain: string;
  market: Market;
  scope: BusinessScope;
  /** Your site's language, from its pages. */
  selfLanguage: string | null;
  competitor: CompetitorMarketProfile;
  /** Searches run for your market where the competitor appeared. */
  searchAppearances?: number;
}): SignalMeasurement {
  const selfCountry = input.market.country;
  const selfLanguage = primaryLanguage(input.selfLanguage) ?? selfCountry?.language ?? null;
  const theirs = input.competitor;
  const evidence = {
    yourMarket: selfCountry?.name ?? (input.market.scope === "global" ? "Global" : null),
    yourScope: input.scope,
    yourLanguage: selfLanguage,
    theirCountry: countryByIso2(theirs.country)?.name ?? null,
    theirCountrySource: theirs.countrySource,
    theirLanguage: theirs.language,
    theirRegions: theirs.regions.length,
  };

  if ((input.searchAppearances ?? 0) > 0 && selfCountry) {
    return {
      score: 1,
      reason: null,
      evidence: {
        ...evidence,
        basis: "search",
        detail: `${input.domain} appears in ${input.searchAppearances} of the searches run for ${selfCountry.name}.`,
      },
    };
  }

  const serves = (country: Country | null) =>
    country != null && (theirs.country === country.iso2 || theirs.regions.includes(country.iso2));

  if (input.scope === "local") {
    if (!selfCountry) {
      return { score: null, evidence, reason: "Your target location does not name a country, and location decides overlap for a local business." };
    }
    if (!theirs.country && theirs.regions.length === 0) {
      return { score: null, evidence, reason: `Could not tell where ${input.domain} operates: its pages name no country.` };
    }
    return {
      score: serves(selfCountry) ? 1 : 0.05,
      reason: null,
      evidence: { ...evidence, basis: "location", detail: serves(selfCountry) ? `Both serve ${selfCountry.name}.` : `${input.domain} does not appear to serve ${selfCountry.name}.` },
    };
  }

  if (input.scope === "national" && selfCountry) {
    if (serves(selfCountry)) {
      return { score: 1, reason: null, evidence: { ...evidence, basis: "location", detail: `Both serve ${selfCountry.name}.` } };
    }
    if (!selfLanguage || !theirs.language) {
      return { score: null, evidence, reason: `Could not tell which market ${input.domain} serves: its pages declare no language or country.` };
    }
    const sameLanguage = theirs.language === selfLanguage;
    const international = theirs.country == null;
    return {
      score: international ? (sameLanguage ? 0.8 : 0.2) : sameLanguage ? 0.4 : 0.1,
      reason: null,
      evidence: {
        ...evidence,
        basis: "language",
        detail: international
          ? `${input.domain} is an international site ${sameLanguage ? "in your language" : "in another language"}.`
          : `${input.domain} is based in another country${sameLanguage ? ", in your language" : ""}.`,
      },
    };
  }

  if (!selfLanguage) {
    return { score: null, evidence, reason: "Your target market is not set and your site's language is unknown." };
  }
  if (!theirs.language) {
    return { score: null, evidence, reason: `${input.domain}'s pages do not declare a language.` };
  }
  const sameLanguage = theirs.language === selfLanguage;
  return {
    score: sameLanguage ? 1 : theirs.regions.length >= 3 ? 0.6 : 0.3,
    reason: null,
    evidence: {
      ...evidence,
      basis: "language",
      detail:
        input.market.scope === "global"
          ? `A global market is compared by language: ${sameLanguage ? "both" : "the sites do not"} publish in the same language.`
          : `Your target market is not set, so the sites are compared by language only.`,
    },
  };
}
