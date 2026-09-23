export type Strategy = "mobile" | "desktop";

export type PageSpeedResult = {
  strategy: Strategy;
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  fcp: number | null;
  lcp: number | null;
  cls: number | null;
  tbt: number | null;
  inp: number | null;
  ttfb: number | null;
  speedIndex: number | null;
  rawData: Record<string, unknown>;
  opportunities: Array<{
    id: string;
    title: string;
    savingsMs: number;
    savingsBytes: number;
    description: string;
    displayValue: string;
  }>;
  diagnostics: Array<{ id: string; title: string; value: string }>;
};

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

export class PageSpeedError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "PageSpeedError";
  }
}

export async function runPageSpeed(
  url: string,
  strategy: Strategy,
  signal?: AbortSignal,
): Promise<PageSpeedResult> {
  const apiKey = process.env.PAGESPEED_API_KEY?.trim();
  if (!apiKey) {
    throw new PageSpeedError(
      "PAGESPEED_API_KEY is not set. Add it to apps/worker/.env and restart the worker.",
    );
  }

  const endpoint = new URL(ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("key", apiKey);
  for (const category of CATEGORIES) {
    endpoint.searchParams.append("category", category);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  // A user stopping the run ends the call now rather than after Lighthouse.
  const onStop = () => controller.abort();
  signal?.addEventListener("abort", onStop, { once: true });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { "user-agent": "SEO-Maker/0.1" },
      signal: controller.signal,
    });
  } catch (error) {
    throw new PageSpeedError(
      signal?.aborted
        ? "Stopped."
        : error instanceof Error && error.name === "AbortError"
          ? "PageSpeed took longer than two minutes and was cancelled."
          : `Could not reach PageSpeed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onStop);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    const detail = body?.error?.message ?? (await response.text().catch(() => ""));
    if (response.status === 429) {
      throw new PageSpeedError(
        "PageSpeed quota reached for this API key. Wait a minute and try again.",
        429,
      );
    }
    if (response.status === 400 || response.status === 403) {
      throw new PageSpeedError(
        `PageSpeed rejected the request: ${detail || response.statusText}`,
        response.status,
      );
    }
    throw new PageSpeedError(
      `PageSpeed failed (${response.status}): ${String(detail).slice(0, 300)}`,
      response.status,
    );
  }

  const payload = (await response.json()) as Record<string, any>;
  const lhr = payload.lighthouseResult ?? {};
  const categories = lhr.categories ?? {};
  const audits = lhr.audits ?? {};

  return {
    strategy,
    performance: scoreToPercent(categories.performance?.score),
    accessibility: scoreToPercent(categories.accessibility?.score),
    bestPractices: scoreToPercent(categories["best-practices"]?.score),
    seo: scoreToPercent(categories.seo?.score),
    fcp: toSeconds(audits["first-contentful-paint"]?.numericValue),
    lcp: toSeconds(audits["largest-contentful-paint"]?.numericValue),
    cls: toFloat(audits["cumulative-layout-shift"]?.numericValue),
    tbt: toMillis(audits["total-blocking-time"]?.numericValue),
    inp: toMillis(
      payload.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile ??
        audits["interaction-to-next-paint"]?.numericValue,
    ),
    ttfb: toSeconds(audits["server-response-time"]?.numericValue),
    speedIndex: toSeconds(audits["speed-index"]?.numericValue),
    rawData: {
      id: payload.id,
      analysisUTCTimestamp: payload.analysisUTCTimestamp,
      lighthouseVersion: lhr.lighthouseVersion,
      finalUrl: lhr.finalDisplayedUrl ?? lhr.finalUrl,
      loadingExperience: payload.loadingExperience ?? null,
      metrics: {
        ttfb: toSeconds(audits["server-response-time"]?.numericValue),
        speedIndex: toSeconds(audits["speed-index"]?.numericValue),
      },
    },
    opportunities: extractOpportunities(audits),
    diagnostics: extractDiagnostics(audits),
  };
}

function scoreToPercent(value: unknown): number | null {
  return typeof value === "number" ? Math.round(value * 100) : null;
}

function toSeconds(value: unknown): number | null {
  return typeof value === "number" ? Number((value / 1000).toFixed(2)) : null;
}

function toMillis(value: unknown): number | null {
  return typeof value === "number" ? Math.round(value) : null;
}

function toFloat(value: unknown): number | null {
  return typeof value === "number" ? Number(value.toFixed(3)) : null;
}

function extractOpportunities(audits: Record<string, any>) {
  return Object.entries(audits)
    .map(([id, audit]) => {
      const title = typeof audit?.title === "string" ? audit.title : null;
      const savingsMs = Number(audit?.details?.overallSavingsMs ?? 0);
      const savingsBytes = Number(audit?.details?.overallSavingsBytes ?? 0);
      if (!title || (savingsMs <= 0 && savingsBytes <= 0)) {
        return null;
      }
      return {
        id,
        title,
        savingsMs: Math.round(savingsMs),
        savingsBytes: Math.round(savingsBytes),
        description: typeof audit?.description === "string" ? audit.description : "",
        displayValue: typeof audit?.displayValue === "string" ? audit.displayValue : "",
      };
    })
    .filter(
      (
        item,
      ): item is {
        id: string;
        title: string;
        savingsMs: number;
        savingsBytes: number;
        description: string;
        displayValue: string;
      } => item !== null,
    )
    .sort((a, b) => b.savingsMs - a.savingsMs || b.savingsBytes - a.savingsBytes)
    .slice(0, 12);
}

function extractDiagnostics(audits: Record<string, any>) {
  const ids = [
    "server-response-time",
    "render-blocking-resources",
    "unused-javascript",
    "unused-css-rules",
    "uses-responsive-images",
    "offscreen-images",
    "total-byte-weight",
    "dom-size",
    "bootup-time",
    "mainthread-work-breakdown",
    "critical-request-chains",
    "uses-long-cache-ttl",
    "font-display",
    "unminified-javascript",
    "unminified-css",
  ];

  return ids
    .map((id) => {
      const audit = audits[id];
      if (!audit || typeof audit.title !== "string") {
        return null;
      }
      if (typeof audit.score === "number" && audit.score >= 0.9) {
        return null;
      }
      const value = typeof audit.displayValue === "string" ? audit.displayValue : "";
      return { id, title: audit.title, value };
    })
    .filter((item): item is { id: string; title: string; value: string } => item !== null);
}
