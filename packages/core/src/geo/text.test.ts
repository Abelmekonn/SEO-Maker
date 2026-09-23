import { describe, expect, it } from "vitest";
import {
  containsPhrase,
  containsVerbatim,
  jaccard,
  lightStem,
  meanPairwiseJaccard,
  normalizeForMatch,
  tokenize,
  tokenSet,
} from "./text";

describe("lightStem", () => {
  it("folds plurals and common verb endings", () => {
    expect(lightStem("services")).toBe("service");
    expect(lightStem("repairs")).toBe("repair");
    expect(lightStem("plumbing")).toBe("plumb");
    expect(lightStem("categories")).toBe("category");
    expect(lightStem("classes")).toBe("class");
    expect(lightStem("launched")).toBe("launch");
  });

  it("leaves short words and -ss endings alone", () => {
    expect(lightStem("ads")).toBe("ads");
    expect(lightStem("is")).toBe("is");
    expect(lightStem("business")).toBe("business");
  });

  // Proper nouns are what a business profile is built from, so mangling them
  // into "addi" would break every name and location check downstream.
  it("does not strip -is or -us endings", () => {
    expect(lightStem("addis")).toBe("addis");
    expect(lightStem("campus")).toBe("campus");
    expect(lightStem("analysis")).toBe("analysis");
  });
});

describe("tokenize", () => {
  it("drops stopwords and punctuation, keeps stems in order", () => {
    expect(tokenize("We are the leading SEO agency, in Addis Ababa!")).toEqual([
      "lead",
      "seo",
      "agency",
      "addis",
      "ababa",
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("the and of")).toEqual([]);
  });
});

describe("jaccard", () => {
  it("is 1 for identical sets and 0 when either is empty", () => {
    expect(jaccard(tokenSet("digital marketing agency"), tokenSet("digital marketing agency"))).toBe(1);
    expect(jaccard(new Set(), tokenSet("anything"))).toBe(0);
  });

  it("falls as the sets diverge", () => {
    const close = jaccard(tokenSet("digital marketing agency"), tokenSet("digital marketing studio"));
    const far = jaccard(tokenSet("digital marketing agency"), tokenSet("plumbing repair company"));
    expect(close).toBeGreaterThan(far);
    expect(far).toBe(0);
  });
});

describe("meanPairwiseJaccard", () => {
  // One description cannot disagree with itself, and reporting an
  // inconsistency finding off a single variant would be fabricated.
  it("is null below two non-empty variants", () => {
    expect(meanPairwiseJaccard([])).toBeNull();
    expect(meanPairwiseJaccard(["SEO agency"])).toBeNull();
    expect(meanPairwiseJaccard(["SEO agency", "   "])).toBeNull();
  });

  it("scores consistent descriptions above divergent ones", () => {
    const consistent = meanPairwiseJaccard([
      "Digital marketing agency in Addis Ababa",
      "A digital marketing agency based in Addis Ababa",
    ]);
    const divergent = meanPairwiseJaccard([
      "SEO agency",
      "Web development company",
      "Restaurant supply wholesaler",
    ]);
    expect(consistent).not.toBeNull();
    expect(divergent).not.toBeNull();
    expect(consistent!).toBeGreaterThan(divergent!);
  });
});

describe("containsVerbatim", () => {
  const page = "We have served over 250 clients since 2014. Our team is based in Addis Ababa.";

  it("accepts a literal quote regardless of case and spacing", () => {
    expect(containsVerbatim(page, "served over 250 clients")).toBe(true);
    expect(containsVerbatim(page, "SERVED   OVER  250   CLIENTS")).toBe(true);
  });

  // This is the zero-hallucination gate: a reworded "quote" must not pass,
  // because anything that passes gets written to a database column as a
  // verbatim claim the page supposedly makes.
  it("rejects a reworded claim", () => {
    expect(containsVerbatim(page, "served more than 250 clients")).toBe(false);
    expect(containsVerbatim(page, "we have 300 clients")).toBe(false);
  });

  it("rejects fragments too short to be evidence", () => {
    expect(containsVerbatim(page, "team")).toBe(false);
  });
});

describe("containsPhrase", () => {
  it("matches reordered and inflected wording", () => {
    const tokens = tokenize("We repair emergency plumbing across the city");
    expect(containsPhrase(tokens, "emergency plumbing repairs")).toBe(true);
  });

  it("matches across intervening words", () => {
    const tokens = tokenize("Emergency plumbing and heating repair services");
    expect(containsPhrase(tokens, "emergency plumbing repair")).toBe(true);
  });

  // The window is what stops a page that merely mentions both words far apart
  // from counting as covering the term.
  it("does not match terms scattered far apart", () => {
    const tokens = tokenize(
      "Emergency callouts available. " +
        "Some unrelated filler about our history and values and awards and team. " +
        "Plumbing supplies are also sold here.",
    );
    expect(containsPhrase(tokens, "emergency plumbing")).toBe(false);
  });

  it("handles single-word terms", () => {
    expect(containsPhrase(tokenize("Our SEO services"), "SEO")).toBe(true);
    expect(containsPhrase(tokenize("Our SEO services"), "plumbing")).toBe(false);
  });
});

describe("normalizeForMatch", () => {
  it("collapses whitespace and case but keeps punctuation", () => {
    expect(normalizeForMatch("  Hello,   World!  ")).toBe("hello, world!");
  });
});
