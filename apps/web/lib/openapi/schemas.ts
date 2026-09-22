import { z } from "zod";
import { registry } from "./registry";

/**
 * Shared schemas, kept separate from route registration.
 *
 * These mirror the actual runtime shapes — Prisma's `Project`/`Page`/`Competitor`
 * columns and the request bodies each route.ts actually parses — rather than
 * an idealized API contract, so the spec cannot say more than the code does.
 */

export const AnalysisMode = z.enum(["quick", "deep"]).openapi("AnalysisMode");

/** Matches `BusinessContext` in apps/web/lib/business-context.ts. Every field optional: Quick mode has none of it. */
export const BusinessContext = registry.register(
  "BusinessContext",
  z.object({
    businessName: z.string().max(120).nullable().optional(),
    businessType: z.string().max(80).nullable().optional(),
    industry: z.string().max(80).nullable().optional(),
    businessDescription: z.string().max(2000).nullable().optional(),
    targetAudience: z.string().max(400).nullable().optional(),
    targetLocation: z.string().max(200).nullable().optional(),
    /** Accepted as an array, or a comma/newline-separated string — parseBusinessContext splits it. */
    servicesProducts: z.union([z.array(z.string()), z.string()]).optional(),
    primaryGoal: z.string().max(400).nullable().optional(),
    targetKeywords: z.union([z.array(z.string()), z.string()]).optional(),
  }),
);

/**
 * Trimmed to the fields most useful for reading results. The real `Page`
 * table has more columns (evidence JSON, raw content, redirect/robots detail)
 * — see packages/db/prisma/schema.prisma for the full row.
 */
export const Page = registry.register(
  "Page",
  z.object({
    id: z.string(),
    projectId: z.string(),
    crawlId: z.string().nullable(),
    url: z.string(),
    finalUrl: z.string().nullable().openapi({
      description: "Set only when this URL redirected. Null means it answered directly.",
    }),
    statusCode: z.number().int().nullable(),
    pageType: z
      .string()
      .nullable()
      .openapi({ description: "homepage | service | product | pricing | legal | article | ... | other" }),
    title: z.string().nullable(),
    metaDesc: z.string().nullable(),
    h1: z.string().nullable(),
    h1Count: z.number().int().nullable(),
    h2Count: z.number().int().nullable(),
    wordCount: z.number().int().nullable(),
    imageCount: z.number().int().nullable(),
    missingAlt: z.number().int().nullable(),
    internalLinks: z.number().int().nullable(),
    schemaCount: z.number().int().nullable(),
    indexable: z.boolean().nullable(),
    inSitemap: z.boolean().nullable().openapi({
      description:
        "Null when the site has no sitemap at all, so nothing corroborates the noindex signal either way.",
    }),
    status: z.string().openapi({ description: "pending | crawling | analyzed | failed" }),
    errorType: z.string().nullable(),
    error: z.string().nullable(),
  }),
);

const projectShape = z.object({
  id: z.string(),
  userId: z.string(),
  rootUrl: z.string().url(),
  name: z.string(),
  maxPages: z.number().int(),
  status: z.string().openapi({ description: "pending | crawling | analyzing | analyzed | failed" }),
  analysisMode: AnalysisMode,
  latestCrawlId: z.string().nullable(),
  perfStatus: z.string().openapi({ description: "idle | queued | running | done | failed" }),
  perfError: z.string().nullable(),
  perfDone: z.number().int(),
  perfTotal: z.number().int(),
  compStatus: z
    .string()
    .openapi({ description: "idle | queued | discovering | analyzing | done | failed" }),
  businessName: z.string().nullable(),
  businessType: z.string().nullable(),
  industry: z.string().nullable(),
  businessDescription: z.string().nullable(),
  targetAudience: z.string().nullable(),
  targetLocation: z.string().nullable(),
  primaryGoal: z.string().nullable(),
  servicesProducts: z.array(z.string()).nullable(),
  targetKeywords: z.array(z.string()).nullable(),
  contextUpdatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

/** Shape returned by `GET /api/projects` — one row per project, no relations. */
export const Project = registry.register("Project", projectShape);

/**
 * Shape returned by `GET /api/projects/{id}` only.
 * `getProjectForUser` attaches the latest crawl's pages; the list endpoint does not.
 */
export const ProjectDetail = registry.register(
  "ProjectDetail",
  projectShape.extend({
    pages: z.array(Page).openapi({
      description: "Pages from the project's latest crawl (or the pending seed row before the first crawl finishes).",
    }),
  }),
);

export const Competitor = registry.register(
  "Competitor",
  z.object({
    id: z.string(),
    projectId: z.string(),
    domain: z.string(),
    name: z.string().nullable(),
    source: z.string().openapi({ description: "manual | serp | ai" }),
    status: z
      .string()
      .openapi({ description: "pending | queued | crawling | analyzing | ready | failed | skipped" }),
    statusError: z.string().nullable(),
    confidence: z.number().nullable(),
    confidenceBand: z.string().nullable(),
    pageCount: z.number().int(),
    seoScore: z.number().nullable(),
    pinned: z.boolean(),
    excluded: z.boolean(),
    createdAt: z.string().datetime(),
  }),
);

// --- Request bodies ----------------------------------------------------------

/** POST /api/projects — see apps/web/app/api/projects/route.ts */
export const CreateProjectRequest = registry.register(
  "CreateProjectRequest",
  z.object({
    url: z.string().openapi({
      example: "example.com",
      description: "Bare domain or full URL. Normalized server-side; https is assumed if no scheme is given.",
    }),
    mode: AnalysisMode.optional().openapi({
      description: "Defaults to 'deep' if `business` has any field set, otherwise 'quick'.",
    }),
    business: BusinessContext.optional(),
  }),
);

export const CreateProjectResponse = registry.register(
  "CreateProjectResponse",
  z.object({ id: z.string() }),
);

/** PUT /api/projects/:id/context — see apps/web/app/api/projects/[id]/context/route.ts */
export const UpdateContextRequest = registry.register(
  "UpdateContextRequest",
  z.object({
    mode: AnalysisMode.optional(),
    business: BusinessContext.optional(),
  }),
);

export const ContextResponse = registry.register(
  "ContextResponse",
  z.object({
    mode: AnalysisMode,
    business: BusinessContext,
    updatedAt: z.string().datetime().nullable().optional(),
  }),
);

/** POST /api/projects/:id/crawl — no request body; response varies by outcome. */
export const CrawlQueuedResponse = registry.register(
  "CrawlQueuedResponse",
  z.object({ ok: z.literal(true), maxPages: z.number().int() }),
);

/** POST /api/projects/:id/performance — see apps/web/app/api/projects/[id]/performance/route.ts */
export const RunPerformanceRequest = registry.register(
  "RunPerformanceRequest",
  z.object({
    pageIds: z
      .array(z.string())
      .optional()
      .openapi({
        description:
          "Which pages to run PageSpeed on. Omit to use the plan default (homepage only on Free; " +
          "shallowest pages up to the plan limit on Pro/Agency). Free always resolves to the homepage " +
          "regardless of what is sent here.",
      }),
  }),
);

export const RunPerformanceResponse = registry.register(
  "RunPerformanceResponse",
  z.object({ ok: z.literal(true), total: z.number().int() }),
);

/** POST /api/projects/:id/competitors — see .../competitors/route.ts */
export const AddCompetitorRequest = registry.register(
  "AddCompetitorRequest",
  z.object({
    domain: z.string().openapi({ example: "competitor.com" }),
    name: z.string().optional(),
  }),
);

export const AddCompetitorResponse = registry.register(
  "AddCompetitorResponse",
  z.object({
    ok: z.literal(true),
    competitor: z.object({
      id: z.string(),
      domain: z.string(),
      name: z.string().nullable(),
      status: z.string(),
    }),
  }),
);

/** PATCH /api/projects/:id/competitors/:competitorId — see .../[competitorId]/route.ts */
export const UpdateCompetitorRequest = registry.register(
  "UpdateCompetitorRequest",
  z
    .object({
      pinned: z.boolean().optional(),
      excluded: z.boolean().optional(),
      name: z.string().optional(),
    })
    .openapi({ description: "At least one field is required; an empty body returns 400." }),
);

export const ProjectIdParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "cm0abc123" }),
});

export const CompetitorIdParams = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "cm0abc123" }),
  competitorId: z
    .string()
    .openapi({ param: { name: "competitorId", in: "path" }, example: "cm0xyz789" }),
});

export const HardDeleteQuery = z.object({
  hard: z
    .enum(["1"])
    .optional()
    .openapi({
      param: { name: "hard", in: "query" },
      description: "Pass hard=1 to permanently delete the row instead of soft-excluding it.",
    }),
});
