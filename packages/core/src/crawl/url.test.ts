import { describe, expect, it } from "vitest";
import { pageKeyOf } from "./url";

describe("pageKeyOf", () => {
  it("is the same for a page however the crawl reached it", () => {
    const key = "stripe.com/pricing";
    expect(pageKeyOf("https://stripe.com/pricing")).toBe(key);
    expect(pageKeyOf("https://www.stripe.com/pricing/")).toBe(key);
    expect(pageKeyOf("http://stripe.com/pricing#plans")).toBe(key);
    expect(pageKeyOf("https://STRIPE.com/pricing?utm_source=x")).toBe(key);
  });

  it("keys the homepage by host alone", () => {
    expect(pageKeyOf("https://stripe.com")).toBe("stripe.com");
    expect(pageKeyOf("https://www.stripe.com/")).toBe("stripe.com");
  });

  it("keeps the query that selects a different document", () => {
    expect(pageKeyOf("https://shop.test/list?b=2&a=1")).toBe("shop.test/list?a=1&b=2");
  });

  it("keys a URL the crawler would not normalize (a file) by its text", () => {
    expect(pageKeyOf("https://stripe.com/files/guide.pdf/")).toBe("stripe.com/files/guide.pdf");
  });

  it("does not merge subdomains", () => {
    expect(pageKeyOf("https://docs.stripe.com/")).not.toBe(pageKeyOf("https://stripe.com/"));
  });
});
