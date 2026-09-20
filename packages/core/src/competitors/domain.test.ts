import { describe, expect, it } from "vitest";
import { hostKey, isNonCompetitorDomain, isSelfDomain, parseDomainInput } from "./domain";

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
