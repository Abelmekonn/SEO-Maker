/**
 * Search results providers.
 *
 * Competitor evidence comes from real search results, fetched through a
 * provider's API with credentials that stay on the server. Nothing here
 * scrapes a search engine, and nothing invents a position: a search that
 * could not be fetched is a failure the caller records, not an empty page.
 *
 *   DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD   enable the DataForSEO provider
 *   DATAFORSEO_API_URL                       optional, e.g. the sandbox
 */

import { registrableDomain } from "../competitors/domain";

export type SerpRequest = {
  query: string;
  /** Google location id (see serpLocationCode). */
  locationCode: number;
  /** ISO 639-1. */
  languageCode: string;
  /** Results to read. */
  depth?: number;
  signal?: AbortSignal;
};

export type SerpItem = {
  /** 1-based organic position. */
  position: number;
  url: string;
  /** Registrable domain, e.g. "adyen.com" for www.adyen.com and docs.adyen.com. */
  domain: string;
  title: string | null;
  snippet: string | null;
  resultType: "organic";
};

export type SerpResponse = { provider: string; items: SerpItem[] };

export type SerpErrorKind = "auth" | "quota" | "bad-request" | "unavailable" | "timeout";

export class SerpError extends Error {
  constructor(
    public kind: SerpErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "SerpError";
  }
}

export interface SerpProvider {
  id: string;
  search(request: SerpRequest): Promise<SerpResponse>;
}

type Env = Record<string, string | undefined>;

function defaultEnv(): Env {
  return typeof process === "undefined" ? {} : process.env;
}

/** Whether a search results provider has credentials. */
export function serpProviderConfigured(env: Env = defaultEnv()): boolean {
  return Boolean(env.DATAFORSEO_LOGIN?.trim() && env.DATAFORSEO_PASSWORD?.trim());
}

/** The configured provider, or null when none is. */
export function createSerpProvider(env: Env = defaultEnv(), fetchImpl: typeof fetch = fetch): SerpProvider | null {
  if (!serpProviderConfigured(env)) return null;
  return dataForSeoProvider({
    login: env.DATAFORSEO_LOGIN!.trim(),
    password: env.DATAFORSEO_PASSWORD!.trim(),
    baseUrl: (env.DATAFORSEO_API_URL?.trim() || "https://api.dataforseo.com").replace(/\/+$/, ""),
    fetchImpl,
  });
}

type DataForSeoItem = {
  type?: string;
  rank_group?: number;
  rank_absolute?: number;
  url?: string;
  domain?: string;
  title?: string;
  description?: string;
};

type DataForSeoResponse = {
  status_code?: number;
  status_message?: string;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: DataForSeoItem[] | null }> | null;
  }>;
};

const TIMEOUT_MS = 45_000;

function errorKind(code: number | undefined): SerpErrorKind {
  if (code === 40100 || code === 40101 || code === 401) return "auth";
  if (code === 40200 || code === 40201 || code === 40202 || code === 402 || code === 429) return "quota";
  if (code != null && ((code >= 40000 && code < 50000) || (code >= 400 && code < 500))) return "bad-request";
  return "unavailable";
}

/**
 * DataForSEO's Google organic results, live mode: one request per search,
 * answered in a few seconds. Organic results only; positions are the
 * provider's organic rank (rank_group).
 */
export function dataForSeoProvider(config: { login: string; password: string; baseUrl: string; fetchImpl?: typeof fetch }): SerpProvider {
  const auth = `Basic ${Buffer.from(`${config.login}:${config.password}`).toString("base64")}`;
  const doFetch = config.fetchImpl ?? fetch;

  async function once(request: SerpRequest): Promise<SerpResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new SerpError("timeout", "The search provider did not answer in time.")), TIMEOUT_MS);
    const onAbort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", onAbort, { once: true });
    let response: Response;
    try {
      response = await doFetch(`${config.baseUrl}/v3/serp/google/organic/live/advanced`, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json" },
        body: JSON.stringify([
          {
            keyword: request.query,
            location_code: request.locationCode,
            language_code: request.languageCode,
            device: "desktop",
            depth: Math.max(10, Math.min(100, request.depth ?? 20)),
          },
        ]),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof SerpError) throw error;
      if (controller.signal.aborted && controller.signal.reason instanceof SerpError) throw controller.signal.reason;
      throw new SerpError("unavailable", `The search provider could not be reached: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
    }

    const body = (await response.json().catch(() => null)) as DataForSeoResponse | null;
    if (!response.ok || !body) {
      throw new SerpError(errorKind(response.status), `The search provider answered ${response.status}${body?.status_message ? `: ${body.status_message}` : ""}.`);
    }
    if (body.status_code !== 20000) {
      throw new SerpError(errorKind(body.status_code), body.status_message ?? "The search provider rejected the request.");
    }
    const task = body.tasks?.[0];
    if (!task || task.status_code !== 20000) {
      throw new SerpError(errorKind(task?.status_code), task?.status_message ?? "The search provider returned no result for this search.");
    }

    const items: SerpItem[] = [];
    const seen = new Set<string>();
    for (const item of task.result?.[0]?.items ?? []) {
      if (item.type !== "organic" || !item.url) continue;
      const position = item.rank_group ?? item.rank_absolute;
      if (!position || position < 1) continue;
      let host = item.domain ?? "";
      try {
        const parsed = new URL(item.url);
        if (!/^https?:$/.test(parsed.protocol)) continue;
        host = host || parsed.hostname;
      } catch {
        continue;
      }
      const key = `${position}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        position,
        url: item.url,
        domain: registrableDomain(host),
        title: item.title?.trim() || null,
        snippet: item.description?.trim() || null,
        resultType: "organic",
      });
    }
    items.sort((a, b) => a.position - b.position);
    return { provider: "dataforseo", items };
  }

  return {
    id: "dataforseo",
    async search(request) {
      try {
        return await once(request);
      } catch (error) {
        // One retry for an outage; never for credentials, balance or a bad request.
        if (error instanceof SerpError && (error.kind === "unavailable" || error.kind === "timeout") && !request.signal?.aborted) {
          return once(request);
        }
        throw error;
      }
    },
  };
}
