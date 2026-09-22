import { type SafeUrlFail, type SafeUrlOk, assertSafeUrl } from "./safe-url";

/**
 * Per-host memo for `assertSafeUrl`.
 *
 * `assertSafeUrl` resolves DNS on every call. Calling it once per request in a
 * crawler means hundreds of lookups for the same hostname in a few minutes,
 * and the resolver starts returning transient failures — which the crawler
 * then read as "this host is not publicly routable" and recorded as blocked
 * pages. On a stripe.com run that turned 78 perfectly good URLs into failures.
 *
 * Caching the verdict per host is safe because it is not the rebinding
 * defense: `guardedLookup` runs at connect time on every single request and
 * checks the address the socket actually uses. This only avoids re-asking DNS
 * the same question.
 */

type CacheEntry = { verdict: SafeUrlOk | SafeUrlFail; expiresAt: number };

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export type SafeUrlCache = {
  check: (url: string | URL) => Promise<SafeUrlOk | SafeUrlFail>;
  clear: () => void;
};

/** Transient resolver problems must not be cached as a permanent verdict. */
function isTransient(verdict: SafeUrlOk | SafeUrlFail): boolean {
  return !verdict.ok && verdict.reason === "dns";
}

export function createSafeUrlCache(ttlMs = DEFAULT_TTL_MS): SafeUrlCache {
  const cache = new Map<string, CacheEntry>();

  return {
    async check(input) {
      let url: URL;
      try {
        url = input instanceof URL ? input : new URL(input);
      } catch {
        return { ok: false, reason: "invalid", detail: "Not a valid URL." };
      }

      // The scheme, port and credential rules are per-URL, not per-host, so
      // they still run every time; only the DNS answer is reused.
      const key = `${url.protocol}//${url.host}`;
      const hit = cache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return hit.verdict.ok ? { ...hit.verdict, url } : hit.verdict;
      }

      const verdict = await assertSafeUrl(url);
      if (!isTransient(verdict)) {
        cache.set(key, { verdict, expiresAt: Date.now() + ttlMs });
      }
      return verdict;
    },
    clear() {
      cache.clear();
    },
  };
}
