import { describe, expect, it } from "vitest";
import {
  discoveryExclusion,
  hostKey,
  isNonCompetitorDomain,
  isSelfDomain,
  normalizeCompetitorDomain,
  parseDomainInput,
  registrableDomain,
} from "./domain";

describe("hostKey", () => {
  it("normalizes case, trailing dots and www", () => {
    expect(hostKey("WWW.Example.COM")).toBe("example.com");
    expect(hostKey("example.com.")).toBe("example.com");
    expect(hostKey("  example.com  ")).toBe("example.com");
  });

  it("keeps other subdomains", () => {
    expect(hostKey("blog.example.com")).toBe("blog.example.com");
  });
});

describe("parseDomainInput", () => {
  it("accepts a bare domain", () => {
    expect(parseDomainInput("example.com")).toEqual({
      domain: "example.com",
      url: "https://example.com/",
    });
  });

  it("strips scheme, www, path, query and port", () => {
    const parsed = parseDomainInput("http://www.Example.com:8080/pricing?a=1#top");
    expect(parsed).toEqual({ domain: "example.com", url: "https://example.com/" });
  });

  it("rejects empty input", () => {
    expect(parseDomainInput("   ")).toEqual({ error: "Enter a competitor domain." });
  });

  it("rejects a dotless host", () => {
    expect(parseDomainInput("localhost")).toHaveProperty("error");
    expect(parseDomainInput("intranet")).toHaveProperty("error");
  });

  it("rejects embedded credentials", () => {
    expect(parseDomainInput("https://user:pass@example.com")).toEqual({
      error: "Remove the username and password from the URL.",
    });
  });

  it("rejects malformed domains", () => {
    expect(parseDomainInput("exa mple.com")).toHaveProperty("error");
    expect(parseDomainInput("https://")).toHaveProperty("error");
    expect(parseDomainInput("example..com")).toHaveProperty("error");
  });

  it("keeps an IP literal out of the happy path", () => {
    // 127.0.0.1 parses as a domain-ish string; the SSRF guard is what rejects it,
    // but it must at least survive parsing so the caller can run that check.
    const parsed = parseDomainInput("127.0.0.1");
    expect(parsed).toEqual({ domain: "127.0.0.1", url: "https://127.0.0.1/" });
  });
});

describe("isSelfDomain", () => {
  it("matches the project root regardless of www or scheme", () => {
    expect(isSelfDomain("example.com", "https://www.example.com/")).toBe(true);
    expect(isSelfDomain("www.example.com", "http://example.com/blog")).toBe(true);
  });

  it("does not match a different site", () => {
    expect(isSelfDomain("other.com", "https://example.com/")).toBe(false);
  });

  it("is false for an unparseable root", () => {
    expect(isSelfDomain("example.com", "not a url")).toBe(false);
  });
});

describe("isNonCompetitorDomain", () => {
  it("filters SERP furniture", () => {
    for (const domain of ["google.com", "youtube.com", "wikipedia.org", "www.facebook.com"]) {
      expect(isNonCompetitorDomain(domain)).toBe(true);
    }
  });

  it("filters government and academic domains", () => {
    expect(isNonCompetitorDomain("irs.gov")).toBe(true);
    expect(isNonCompetitorDomain("mit.edu")).toBe(true);
    expect(isNonCompetitorDomain("nhs.gov.uk")).toBe(true);
  });

  it("keeps ordinary commercial domains", () => {
    expect(isNonCompetitorDomain("competitorsite.com")).toBe(false);
    expect(isNonCompetitorDomain("agency.co.uk")).toBe(false);
  });
});

describe("normalizeCompetitorDomain", () => {
  it("resolves every spelling of one site to the same competitor", () => {
    const spellings = ["www.example.com", "example.com", "https://example.com/", "https://www.example.com/pricing?x=1", "HTTP://Example.COM."];
    expect(new Set(spellings.map(normalizeCompetitorDomain))).toEqual(new Set(["example.com"]));
  });

  it("returns null for something that is not a domain", () => {
    expect(normalizeCompetitorDomain("")).toBeNull();
    expect(normalizeCompetitorDomain("localhost")).toBeNull();
  });
});

describe("registrableDomain", () => {
  it("groups a company's subdomains under its domain", () => {
    expect(registrableDomain("docs.adyen.com")).toBe("adyen.com");
    expect(registrableDomain("www.adyen.com")).toBe("adyen.com");
    expect(registrableDomain("adyen.com")).toBe("adyen.com");
  });

  it("keeps country second levels as part of the suffix", () => {
    expect(registrableDomain("shop.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("www.bank.com.et")).toBe("bank.com.et");
  });

  it("keeps separate owners on a hosting platform apart", () => {
    expect(registrableDomain("alice.github.io")).toBe("alice.github.io");
    expect(registrableDomain("store.myshopify.com")).toBe("store.myshopify.com");
  });
});

describe("isSelfDomain with subdomains", () => {
  it("treats the site's own subdomains as its own", () => {
    expect(isSelfDomain("docs.stripe.com", "https://stripe.com/")).toBe(true);
  });
});

describe("discoveryExclusion", () => {
  it("names why a domain is not a business competitor", () => {
    expect(discoveryExclusion("www.google.co.uk")).toBe("Search engine");
    expect(discoveryExclusion("en.wikipedia.org")).toBe("Reference site");
    expect(discoveryExclusion("g2.com")).toBe("Review or comparison site");
    expect(discoveryExclusion("forbes.com")).toBe("General publisher");
    expect(discoveryExclusion("yelp.com")).toBe("Directory or listing site");
  });

  it("lets ordinary businesses through", () => {
    expect(discoveryExclusion("adyen.com")).toBeNull();
  });

  it("does not block a publisher a user adds by hand", () => {
    expect(isNonCompetitorDomain("forbes.com")).toBe(false);
    expect(isNonCompetitorDomain("youtube.com")).toBe(true);
  });
});
