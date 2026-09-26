import { describe, expect, it } from "vitest";
import { SerpError, createSerpProvider, serpProviderConfigured } from "./index";

const env = { DATAFORSEO_LOGIN: "login", DATAFORSEO_PASSWORD: "secret" };

function fakeFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("serp provider", () => {
  it("is configured only with both credentials", () => {
    expect(serpProviderConfigured({})).toBe(false);
    expect(serpProviderConfigured({ DATAFORSEO_LOGIN: "x" })).toBe(false);
    expect(serpProviderConfigured(env)).toBe(true);
    expect(createSerpProvider({})).toBeNull();
  });

  it("requests the market's location and language and reads organic results only", async () => {
    const { impl, calls } = fakeFetch({
      status_code: 20000,
      tasks: [
        {
          status_code: 20000,
          result: [
            {
              items: [
                { type: "paid", rank_group: 1, url: "https://ads.example/", domain: "ads.example" },
                { type: "organic", rank_group: 1, url: "https://www.adyen.com/payments", domain: "www.adyen.com", title: "Payments", description: "Accept payments" },
                { type: "people_also_ask", rank_group: 1 },
                { type: "organic", rank_group: 2, url: "https://docs.stripe.com/x", domain: "docs.stripe.com", title: "Docs" },
                { type: "organic", rank_group: 3, url: "javascript:alert(1)", domain: "evil" },
              ],
            },
          ],
        },
      ],
    });
    const provider = createSerpProvider(env, impl)!;
    const response = await provider.search({ query: "payment gateway", locationCode: 2231, languageCode: "en" });
    expect(response.items).toEqual([
      { position: 1, url: "https://www.adyen.com/payments", domain: "adyen.com", title: "Payments", snippet: "Accept payments", resultType: "organic" },
      { position: 2, url: "https://docs.stripe.com/x", domain: "stripe.com", title: "Docs", snippet: null, resultType: "organic" },
    ]);
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent[0]).toMatchObject({ keyword: "payment gateway", location_code: 2231, language_code: "en" });
    expect(String((calls[0].init.headers as Record<string, string>).authorization)).toMatch(/^Basic /);
  });

  it("maps credential and balance failures without retrying", async () => {
    const { impl, calls } = fakeFetch({ status_code: 40200, status_message: "Payment Required." });
    const provider = createSerpProvider(env, impl)!;
    await expect(provider.search({ query: "x y", locationCode: 2840, languageCode: "en" })).rejects.toMatchObject({ kind: "quota" });
    expect(calls).toHaveLength(1);
    await expect(provider.search({ query: "x y", locationCode: 2840, languageCode: "en" })).rejects.toBeInstanceOf(SerpError);
  });

  it("retries an outage once", async () => {
    const { impl, calls } = fakeFetch({ status_code: 50000, status_message: "Internal error" }, 500);
    const provider = createSerpProvider(env, impl)!;
    await expect(provider.search({ query: "x y", locationCode: 2840, languageCode: "en" })).rejects.toMatchObject({ kind: "unavailable" });
    expect(calls).toHaveLength(2);
  });
});
