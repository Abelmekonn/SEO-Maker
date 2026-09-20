import dns from "node:dns";
import {
  ALLOWED_PORTS,
  ALLOWED_SCHEMES,
  type UrlRejection,
  defaultPortFor,
  isBlockedHostname,
  isBlockedIp,
  isIpv4,
} from "./ip-rules";

export class SafeUrlError extends Error {
  constructor(
    readonly reason: UrlRejection,
    message: string,
  ) {
    super(message);
    this.name = "SafeUrlError";
  }
}

export type SafeUrlOk = { ok: true; url: URL; addresses: string[] };
export type SafeUrlFail = { ok: false; reason: UrlRejection; detail: string };

const HTML_TYPES = ["text/html", "application/xhtml+xml"];

/**
 * Validates a URL before we fetch it.
 *
 * Resolves DNS and rejects if ANY returned address is blocked — reject-if-any,
 * not reject-if-all, because a hostile name can answer with one public and one
 * private address and we must not pick the private one.
 */
export async function assertSafeUrl(input: string | URL): Promise<SafeUrlOk | SafeUrlFail> {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return { ok: false, reason: "invalid", detail: "Not a valid URL." };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return { ok: false, reason: "scheme", detail: `Scheme ${url.protocol} is not allowed.` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials", detail: "URLs with credentials are not allowed." };
  }

  const port = url.port === "" ? defaultPortFor(url.protocol) : Number(url.port);
  if (!ALLOWED_PORTS.has(port)) {
    return { ok: false, reason: "port", detail: `Port ${port} is not allowed.` };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(url.hostname)) {
    return { ok: false, reason: "hostname", detail: "Hostname is not publicly routable." };
  }

  // A literal address never needs resolving.
  if (isIpv4(hostname) || hostname.includes(":")) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: "private-ip", detail: "Address is not publicly routable." };
    }
    return { ok: true, url, addresses: [hostname] };
  }

  let resolved: dns.LookupAddress[];
  try {
    resolved = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: "dns", detail: "Hostname could not be resolved." };
  }
  if (resolved.length === 0) {
    return { ok: false, reason: "dns", detail: "Hostname could not be resolved." };
  }

  const blocked = resolved.find((entry) => isBlockedIp(entry.address));
  if (blocked) {
    return { ok: false, reason: "private-ip", detail: "Address is not publicly routable." };
  }

  return { ok: true, url, addresses: resolved.map((entry) => entry.address) };
}

/**
 * A `dns.lookup` drop-in that refuses blocked addresses.
 *
 * This is the DNS-rebinding defense: it runs at connect time against the address
 * the socket will actually use, so a TTL-0 flip between validation and fetch is
 * still caught. Pass it to undici's `Agent({ connect: { lookup } })` or got's
 * `dnsLookup`.
 */
export const guardedLookup = ((
  hostname: string,
  options: dns.LookupAllOptions | dns.LookupOneOptions | ((...args: unknown[]) => void),
  callback?: (...args: unknown[]) => void,
) => {
  const cb = (typeof options === "function" ? options : callback) as (...args: unknown[]) => void;
  const opts = (typeof options === "function" ? {} : options) as dns.LookupAllOptions;

  dns.lookup(hostname, { ...opts, all: true }, (error, addresses) => {
    if (error) {
      cb(error);
      return;
    }
    const list = addresses as dns.LookupAddress[];
    const blocked = list.find((entry) => isBlockedIp(entry.address));
    if (blocked) {
      cb(new SafeUrlError("private-ip", `Blocked address ${blocked.address} for ${hostname}`));
      return;
    }
    if (opts.all) {
      cb(null, list);
      return;
    }
    cb(null, list[0].address, list[0].family);
  });
}) as unknown as typeof dns.lookup;

export type SafeFetchResult = {
  status: number;
  finalUrl: string;
  body: string;
  contentType: string | null;
};

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  /** Accept any content type rather than HTML only (robots.txt, sitemaps). */
  allowAnyContentType?: boolean;
};

/**
 * Fetches a URL with every redirect hop re-validated.
 *
 * `redirect: "follow"` cannot do this — it would follow a public URL straight to
 * an internal address without ever handing us the intermediate hop.
 */
export async function safeFetch(
  input: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 3;

  let current = input;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const check = await assertSafeUrl(current);
    if (!check.ok) {
      throw new SafeUrlError(check.reason, check.detail);
    }

    const response = await fetch(check.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "SEO-Maker-Bot/0.1",
        accept: "text/html,application/xhtml+xml",
        ...options.headers,
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new SafeUrlError("invalid", "Redirect without a location header.");
      }
      current = new URL(location, check.url).toString();
      continue;
    }

    const contentType = response.headers.get("content-type");
    if (
      !options.allowAnyContentType &&
      contentType &&
      !HTML_TYPES.some((type) => contentType.toLowerCase().startsWith(type))
    ) {
      throw new SafeUrlError("content-type", `Unsupported content type ${contentType}.`);
    }

    const body = await readCapped(response, maxBytes);
    return {
      status: response.status,
      finalUrl: check.url.toString(),
      body,
      contentType,
    };
  }

  throw new SafeUrlError("redirect-limit", `More than ${maxRedirects} redirects.`);
}

async function readCapped(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new SafeUrlError("size", `Response exceeded ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}
