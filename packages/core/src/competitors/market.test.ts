import { describe, expect, it } from "vitest";
import {
  businessScope,
  competitorMarketProfile,
  countryFromHost,
  measureMarketOverlap,
  primaryLanguage,
  resolveMarket,
  serpLocationCode,
} from "./market";

describe("resolveMarket", () => {
  it("finds the country in a free-text location", () => {
    expect(resolveMarket("Ethiopia").country?.iso2).toBe("et");
    expect(resolveMarket("Addis Ababa, Ethiopia").country?.iso2).toBe("et");
    expect(resolveMarket("UK").country?.iso2).toBe("gb");
    expect(resolveMarket("United States").scope).toBe("country");
  });

  it("reads a global business with its main market", () => {
    const market = resolveMarket("Global (mainly United States)");
    expect(market.scope).toBe("global");
    expect(market.country?.iso2).toBe("us");
  });

  it("never assumes a country that was not named", () => {
    expect(resolveMarket(null)).toEqual({ scope: "unknown", country: null, label: null });
    expect(resolveMarket("Worldwide").country).toBeNull();
    expect(resolveMarket("London").country).toBeNull();
  });

  it("does not read ordinary words as country codes", () => {
    expect(resolveMarket("Customers in cities").country).toBeNull();
  });
});

describe("serpLocationCode", () => {
  it("uses Google's country ids", () => {
    expect(serpLocationCode(resolveMarket("United States").country!)).toBe(2840);
    expect(serpLocationCode(resolveMarket("Ethiopia").country!)).toBe(2231);
    expect(serpLocationCode(resolveMarket("United Kingdom").country!)).toBe(2826);
  });
});

describe("countryFromHost and primaryLanguage", () => {
  it("reads a country-code domain, not a generic one", () => {
    expect(countryFromHost("example.co.uk")?.iso2).toBe("gb");
    expect(countryFromHost("shop.de")?.iso2).toBe("de");
    expect(countryFromHost("startup.io")).toBeNull();
    expect(countryFromHost("adyen.com")).toBeNull();
  });

  it("keeps only the language subtag", () => {
    expect(primaryLanguage("en-GB")).toBe("en");
    expect(primaryLanguage("de")).toBe("de");
    expect(primaryLanguage("not a tag!")).toBeNull();
  });
});

describe("competitorMarketProfile", () => {
  it("takes the country from the domain first, then a postal address", () => {
    const byDomain = competitorMarketProfile({ host: "shop.co.uk", pages: [{ language: "en", hreflang: [], addressCountries: [] }] });
    expect(byDomain).toMatchObject({ country: "gb", countrySource: "domain", language: "en" });
    const byAddress = competitorMarketProfile({ host: "shop.com", pages: [{ language: "en-US", hreflang: [], addressCountries: ["Ethiopia"] }] });
    expect(byAddress).toMatchObject({ country: "et", countrySource: "address" });
  });

  it("treats a site with many regional versions as international", () => {
    const profile = competitorMarketProfile({
      host: "adyen.com",
      pages: [{ language: "en-US", hreflang: ["en-GB", "de-DE", "fr-FR", "en-US"], addressCountries: [] }],
    });
    expect(profile.country).toBeNull();
    expect(profile.regions).toEqual(["de", "fr", "gb", "us"]);
  });
});

describe("measureMarketOverlap", () => {
  const international = { country: null, countrySource: null, language: "en", regions: [] };

  it("counts an appearance in your market's searches as observed overlap", () => {
    const result = measureMarketOverlap({
      domain: "rival.com",
      market: resolveMarket("Ethiopia"),
      scope: "national",
      selfLanguage: "en",
      competitor: { ...international, language: "fr" },
      searchAppearances: 3,
    });
    expect(result.score).toBe(1);
    expect(result.evidence?.basis).toBe("search");
  });

  it("does not require a global SaaS rival to be in the same country", () => {
    const market = resolveMarket("Global (mainly United States)");
    const result = measureMarketOverlap({
      domain: "adyen.com",
      market,
      scope: businessScope({ family: "saas", market }),
      selfLanguage: "en",
      competitor: { country: "nl", countrySource: "address", language: "en", regions: [] },
    });
    expect(result.score).toBe(1);
  });

  it("makes location decide for a local business", () => {
    const market = resolveMarket("Addis Ababa, Ethiopia");
    const scope = businessScope({ family: "local-service", market });
    const same = measureMarketOverlap({ domain: "a.com.et", market, scope, selfLanguage: "en", competitor: { country: "et", countrySource: "domain", language: "en", regions: [] } });
    const elsewhere = measureMarketOverlap({ domain: "b.co.uk", market, scope, selfLanguage: "en", competitor: { country: "gb", countrySource: "domain", language: "en", regions: [] } });
    expect(same.score).toBe(1);
    expect(elsewhere.score).toBeLessThan(0.1);
  });

  it("says why when a side's market is unknown", () => {
    const result = measureMarketOverlap({
      domain: "rival.com",
      market: resolveMarket(null),
      scope: "unknown",
      selfLanguage: null,
      competitor: international,
    });
    expect(result.score).toBeNull();
    expect(result.reason).toMatch(/target market is not set/);
  });
});
