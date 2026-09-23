import { describe, expect, it } from "vitest";
import { AI_CRAWLER_AGENTS } from "./agents";
import {
  type AccessPage,
  type CrawlerAccessInput,
  buildAiCrawlerMatrix,
} from "./crawler-access";

function accessPage(overrides: Partial<AccessPage> = {}): AccessPage {
  return {
    id: "p1",
    url: "https://example.com/",
    statusCode: 200,
    robotsMeta: null,
    xRobotsTag: null,
    indexable: true,
    errorType: null,
    contentType: "text/html",
    wordCount: 500,
    ...overrides,
  };
}

function input(overrides: Partial<CrawlerAccessInput> = {}): CrawlerAccessInput {
  return {
    robotsTxt: "User-agent: *\nAllow: /\n",
    robotsStatus: 200,
    pages: [accessPage()],
    ...overrides,
  };
}

function rowFor(result: ReturnType<typeof buildAiCrawlerMatrix>, token: string) {
  return result.matrix.find((row) => row.agent.token === token)!;
}

describe("buildAiCrawlerMatrix", () => {
  it("covers every known agent", () => {
    const result = buildAiCrawlerMatrix(input());
    expect(result.matrix).toHaveLength(AI_CRAWLER_AGENTS.length);
  });

  it("scores a fully open site at 1", () => {
    expect(buildAiCrawlerMatrix(input()).raw).toBe(1);
  });

  // We never impersonate another crawler, so this can only ever be not_tested.
  it("always reports live-agent-fetch as not tested", () => {
    const result = buildAiCrawlerMatrix(input());
    for (const row of result.matrix) {
      expect(row.checks["live-agent-fetch"].status).toBe("not_tested");
      expect(row.checks["live-agent-fetch"].detail).toContain("did not request");
    }
  });

  it("treats a missing robots.txt as permission, not as a failure", () => {
    const result = buildAiCrawlerMatrix(input({ robotsTxt: null, robotsStatus: 404 }));
    expect(result.signals["robots-root"]).toBe("pass");
    expect(rowFor(result, "oai-searchbot").checks["robots-root"].detail).toContain("404");
  });

  // The distinction the whole dimension turns on: unreadable is not blocked.
  it("treats an unreadable robots.txt as unknown and redistributes its weight", () => {
    const result = buildAiCrawlerMatrix(input({ robotsTxt: null, robotsStatus: 503 }));
    expect(result.signals["robots-root"]).toBe("unknown");
    expect(result.notMeasured).toContain("robots-root");
    // The remaining checks still pass, so the score must not be dragged down.
    expect(result.raw).toBe(1);
  });

  it("fails robots-root when a discovery agent is disallowed", () => {
    const result = buildAiCrawlerMatrix(
      input({ robotsTxt: "User-agent: OAI-SearchBot\nDisallow: /\n" }),
    );
    expect(rowFor(result, "oai-searchbot").checks["robots-root"].status).toBe("fail");
    expect(result.signals["robots-root"]).toBe("fail");
    expect(result.raw).toBeLessThan(1);
  });

  // Blocking a training crawler is a legitimate, deliberate choice. It shows in
  // the matrix but must never reduce the readiness score.
  it("does not penalise blocking a training crawler", () => {
    const result = buildAiCrawlerMatrix(
      input({ robotsTxt: "User-agent: GPTBot\nDisallow: /\n" }),
    );
    expect(rowFor(result, "gptbot").checks["robots-root"].status).toBe("fail");
    expect(rowFor(result, "gptbot").scored).toBe(false);
    expect(result.signals["robots-root"]).toBe("pass");
    expect(result.raw).toBe(1);
  });

  it("marks training crawlers unscored and discovery crawlers scored", () => {
    const result = buildAiCrawlerMatrix(input());
    expect(rowFor(result, "oai-searchbot").scored).toBe(true);
    expect(rowFor(result, "chatgpt-user").scored).toBe(true);
    expect(rowFor(result, "googlebot").scored).toBe(true);
    expect(rowFor(result, "gptbot").scored).toBe(false);
    expect(rowFor(result, "google-extended").scored).toBe(false);
    expect(rowFor(result, "ccbot").scored).toBe(false);
  });

  // A noindex removes Google AI eligibility but does not stop an OpenAI fetcher.
  it("counts noindex only against agents tied to Google's index", () => {
    const result = buildAiCrawlerMatrix(
      input({ pages: [accessPage({ indexable: false })] }),
    );
    expect(rowFor(result, "googlebot").checks.noindex.status).toBe("fail");
    expect(rowFor(result, "oai-searchbot").checks.noindex.status).toBe("not_tested");
    expect(result.signals.noindex).toBe("fail");
  });

  it("reports unknown indexability as unknown rather than passing it", () => {
    const result = buildAiCrawlerMatrix(input({ pages: [accessPage({ indexable: null })] }));
    expect(rowFor(result, "googlebot").checks.noindex.status).toBe("unknown");
  });

  it("fails robots-key-pages when an analysed page is disallowed", () => {
    const result = buildAiCrawlerMatrix(
      input({
        robotsTxt: "User-agent: *\nDisallow: /private\n",
        pages: [accessPage(), accessPage({ id: "p2", url: "https://example.com/private/x" })],
      }),
    );
    expect(result.signals["robots-root"]).toBe("pass");
    expect(result.signals["robots-key-pages"]).toBe("fail");
    expect(rowFor(result, "oai-searchbot").checks["robots-key-pages"].detail).toContain("/private/x");
  });

  it("fails http-status on an error page and names it", () => {
    const result = buildAiCrawlerMatrix(
      input({ pages: [accessPage({ statusCode: 500, url: "https://example.com/broken" })] }),
    );
    expect(result.signals["http-status"]).toBe("fail");
    expect(rowFor(result, "googlebot").checks["http-status"].detail).toContain("/broken");
  });

  it("fails auth-wall on a 401 and on a 200 with no text", () => {
    expect(
      buildAiCrawlerMatrix(input({ pages: [accessPage({ statusCode: 401 })] })).signals["auth-wall"],
    ).toBe("fail");
    expect(
      buildAiCrawlerMatrix(input({ pages: [accessPage({ wordCount: 0 })] })).signals["auth-wall"],
    ).toBe("fail");
  });

  // bot-challenge is an observation about our own crawl and never a pass.
  it("never reports bot-challenge as a pass", () => {
    const clean = buildAiCrawlerMatrix(input());
    expect(clean.signals["bot-challenge"]).toBe("unknown");
    const challenged = buildAiCrawlerMatrix(
      input({ pages: [accessPage({ statusCode: 429 })] }),
    );
    expect(challenged.signals["bot-challenge"]).toBe("unknown");
    expect(rowFor(challenged, "googlebot").checks["bot-challenge"].detail).toContain("bot protection");
  });

  // The case redistribute() exists for: nothing observable, so no score at all.
  it("returns a null score when nothing could be measured", () => {
    const result = buildAiCrawlerMatrix({ robotsTxt: null, robotsStatus: null, pages: [] });
    expect(result.raw).toBeNull();
    expect(result.notMeasured).toHaveLength(5);
  });
});
