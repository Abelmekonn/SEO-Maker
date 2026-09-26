import { z } from "zod";
import { ErrorResponse, registry } from "./registry";
import { ProjectIdParam } from "./schemas";

/**
 * The AI Workspace, usage, sites, search and Quick Search endpoints.
 *
 * Same rule as paths.ts: one entry per route handler this app exports,
 * describing what the code does.
 */

const auth = { security: [{ ClerkSession: [] }] };
const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
});

const Window = z.object({
  used: z.number(),
  limit: z.number().nullable(),
  remaining: z.number().nullable(),
  resetsAt: z.string().nullable(),
});
const Quota = z.object({ daily: Window, weekly: Window, exhausted: z.enum(["daily", "weekly"]).nullable() });
const PageIdParams = z.object({ id: z.string(), pageId: z.string() });
const AiQueued = z.object({
  ok: z.literal(true),
  queued: z.union([z.number(), z.boolean()]),
  message: z.string().optional(),
  quota: Quota.optional(),
});
const QUOTA_429 = { description: "The user's AI allowance is used up (Free: 2 a day, 10 a week), or AI is at capacity", ...jsonBody(ErrorResponse) };
const UNAVAILABLE_503 = { description: "AI unavailable, or the queue is offline", ...jsonBody(ErrorResponse) };

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/analyze",
  tags: ["AI Workspace"],
  summary: "Page AI: queue AI outputs for one page (or, on a paid plan, a batch)",
  description:
    "Only ever called by a user action; a crawl never triggers it. `outputs` names what to write: analysis, metadata, " +
    "content, headings, schema, alt-text, internal-links. Outputs the page has no evidence for are refused without " +
    "charging. Each page queued is one generation from the user's allowance, settled by the worker: a failed or " +
    "fully cached generation is not counted. Free: homepage only. Send an `idempotency-key` header (or `requestId`) " +
    "so a retried request is charged once.",
  ...auth,
  request: {
    params: ProjectIdParam,
    body: jsonBody(
      z.object({
        pageId: z.string().optional(),
        outputs: z
          .array(z.enum(["analysis", "metadata", "content", "headings", "schema", "alt-text", "internal-links"]))
          .optional(),
        next: z.number().int().optional(),
        force: z.boolean().optional(),
        requestId: z.string().optional(),
      }),
    ),
  },
  responses: {
    200: { description: "Queued, already queued, or nothing to do", ...jsonBody(AiQueued) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "Plan does not include this (Free: homepage only, one page at a time)", ...jsonBody(ErrorResponse) },
    404: { description: "Project or page not found", ...jsonBody(ErrorResponse) },
    409: { description: "The page is being fetched or was not analysed", ...jsonBody(ErrorResponse) },
    422: { description: "The page has no evidence for the outputs asked for", ...jsonBody(ErrorResponse) },
    429: QUOTA_429,
    503: UNAVAILABLE_503,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/ai/site",
  tags: ["AI Workspace"],
  summary: "Site AI: queue a site strategy, or explanations of the site opportunities",
  description:
    "`task: strategy` writes content opportunities, topic structure, internal-link strategy, site architecture and " +
    "content strategy from Site Intelligence; every recommendation cites the evidence ids it rests on. Pro and Agency.",
  ...auth,
  request: {
    params: ProjectIdParam,
    body: jsonBody(
      z.object({
        task: z.enum(["strategy", "opportunities"]).optional(),
        force: z.boolean().optional(),
        requestId: z.string().optional(),
      }),
    ),
  },
  responses: {
    200: { description: "Queued, or already running", ...jsonBody(AiQueued) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "Plan does not include Site AI", ...jsonBody(ErrorResponse) },
    409: { description: "No complete crawl yet", ...jsonBody(ErrorResponse) },
    429: QUOTA_429,
    503: UNAVAILABLE_503,
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/ai/site",
  tags: ["AI Workspace"],
  summary: "Site AI status and the latest site strategy",
  ...auth,
  request: { params: ProjectIdParam },
  responses: {
    200: {
      description: "OK",
      ...jsonBody(
        z.object({
          queueOnline: z.boolean(),
          running: z.array(z.object({ state: z.string(), task: z.string() })),
          strategy: z.unknown().nullable(),
          quota: Quota,
        }),
      ),
    },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Project not found", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/pages/{pageId}/priority",
  tags: ["Projects"],
  summary: "Make a Standard page Priority and fetch its full content now",
  description:
    "Fetches that one page (nothing else on the site) with a Priority Crawl, re-runs its checks, and keeps it " +
    "Priority on later crawls. Capped by the plan's Priority pages.",
  ...auth,
  request: { params: PageIdParams },
  responses: {
    200: {
      description: "Queued, or already running",
      ...jsonBody(z.object({ ok: z.literal(true), queued: z.boolean(), message: z.string().optional() })),
    },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "The plan's Priority pages are in use", ...jsonBody(ErrorResponse) },
    404: { description: "Page not found", ...jsonBody(ErrorResponse) },
    409: { description: "Already Priority, from an earlier crawl, or failed in the last crawl", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/account/usage",
  tags: ["Account"],
  summary: "The user's plan capabilities and AI allowance",
  description: "Counts only: generations used and left today and this week, and when the next frees up. Never tokens or cost.",
  ...auth,
  responses: {
    200: {
      description: "OK",
      ...jsonBody(
        z.object({
          plan: z.string(),
          label: z.string(),
          ai: z.object({ page: z.boolean(), site: z.boolean(), competitor: z.boolean(), homepageOnly: z.boolean() }),
          quota: Quota,
          recrawlsPerSite: z.number().nullable(),
        }),
      ),
    },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/sites",
  tags: ["Sites"],
  summary: "The user's sites: searched, filtered by date, sorted, paginated",
  ...auth,
  request: {
    query: z.object({
      q: z.string().optional(),
      field: z.enum(["added", "crawled"]).optional(),
      from: z.string().optional().openapi({ description: "YYYY-MM-DD, inclusive" }),
      to: z.string().optional().openapi({ description: "YYYY-MM-DD, inclusive" }),
      sort: z.enum(["recent", "added", "name", "score", "crawled"]).optional(),
      dir: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().optional(),
      pageSize: z.number().int().max(50).optional(),
    }),
  },
  responses: {
    200: {
      description: "OK",
      ...jsonBody(
        z.object({ items: z.array(z.unknown()), total: z.number(), page: z.number(), pageSize: z.number(), pageCount: z.number() }),
      ),
    },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/search",
  tags: ["Sites"],
  summary: "Workspace search across sites, their pages (latest crawl) and screens",
  ...auth,
  request: {
    query: z.object({
      q: z.string(),
      project: z.string().optional(),
      offset: z.number().int().optional(),
      limit: z.number().int().optional(),
    }),
  },
  responses: {
    200: {
      description: "OK",
      ...jsonBody(
        z.object({
          q: z.string(),
          sites: z.array(z.unknown()),
          pages: z.object({ items: z.array(z.unknown()), total: z.number(), offset: z.number(), limit: z.number() }),
          destinations: z.array(z.unknown()),
        }),
      ),
    },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/quick-search",
  tags: ["Quick Search"],
  summary: "Inspect one URL: status, head, headings, canonical, indexability",
  description:
    "Reads only the start of the page (at most 512 KiB), checks robots.txt for its path, and runs deterministic " +
    "checks. Nothing is stored; no AI runs. Rate-limited per user.",
  ...auth,
  request: { body: jsonBody(z.object({ url: z.string() })) },
  responses: {
    200: {
      description: "The inspection",
      ...jsonBody(
        z
          .object({
            finalUrl: z.string(),
            status: z.number().nullable(),
            checks: z.array(
              z.object({ id: z.string(), label: z.string(), status: z.enum(["pass", "fail", "warn", "info"]), detail: z.string() }),
            ),
          })
          .passthrough(),
      ),
    },
    400: { description: "Not a page address", ...jsonBody(ErrorResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    429: { description: "Too many searches in a short time", ...jsonBody(ErrorResponse) },
  },
});
