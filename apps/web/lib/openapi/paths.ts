import { z } from "zod";
import { ErrorResponse, OkResponse, registry } from "./registry";
import {
  AddCompetitorRequest,
  AddCompetitorResponse,
  CompetitorIdParams,
  ContextResponse,
  CrawlQueuedResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  HardDeleteQuery,
  Project,
  ProjectDetail,
  ProjectIdParam,
  RunPerformanceRequest,
  RunPerformanceResponse,
  UpdateCompetitorRequest,
  UpdateContextRequest,
} from "./schemas";

/**
 * One `registerPath` call per route handler this app actually exports.
 *
 * Grounded in the route.ts files as of this writing — the goal is a spec that
 * describes what the code does, not what an idealized API would look like.
 * When a route changes, update its entry here in the same commit.
 */

const auth = { security: [{ ClerkSession: [] }] };
const jsonBody = <T extends z.ZodTypeAny>(schema: T) => ({
  content: { "application/json": { schema } },
});

// --- /api/projects ----------------------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/projects",
  tags: ["Projects"],
  summary: "List the signed-in user's projects",
  ...auth,
  responses: {
    200: { description: "OK", ...jsonBody(z.object({ projects: z.array(Project) })) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects",
  tags: ["Projects"],
  summary: "Create a project and queue its first crawl",
  description:
    "Validates and normalizes the URL, then runs `assertSafeUrl` (SSRF check) before creating anything. " +
    "Refuses if the account is already at its plan's project limit.",
  ...auth,
  request: { body: jsonBody(CreateProjectRequest) },
  responses: {
    200: { description: "Created", ...jsonBody(CreateProjectResponse) },
    400: {
      description: "Invalid URL, or the URL resolves to a non-public address",
      ...jsonBody(ErrorResponse),
    },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    409: {
      description: "Plan's project limit reached. `id` is the existing project to open instead.",
      ...jsonBody(ErrorResponse),
    },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}",
  tags: ["Projects"],
  summary: "Get one project",
  ...auth,
  request: { params: ProjectIdParam },
  responses: {
    200: { description: "OK", ...jsonBody(z.object({ project: ProjectDetail })) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found, or not owned by the signed-in user", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/context ---------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/context",
  tags: ["Business context"],
  summary: "Read a project's analysis mode and business context",
  ...auth,
  request: { params: ProjectIdParam },
  responses: {
    200: { description: "OK", ...jsonBody(ContextResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/projects/{id}/context",
  tags: ["Business context"],
  summary: "Replace a project's business context",
  description:
    "Every field is optional. Mode defaults to 'deep' when any business field is set, otherwise 'quick' — " +
    "clearing every field and omitting `mode` drops the project back to Quick.",
  ...auth,
  request: { params: ProjectIdParam, body: jsonBody(UpdateContextRequest) },
  responses: {
    200: { description: "Saved", ...jsonBody(z.object({ ok: z.literal(true) }).merge(ContextResponse)) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/crawl ------------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/crawl",
  tags: ["Crawling"],
  summary: "Queue a crawl (first run or re-crawl)",
  description:
    "Non-destructive: this queues a new `Crawl` row. The project keeps serving its last completed crawl's " +
    "pages until the new one finishes, so a failed re-crawl never wipes out a working result.",
  ...auth,
  request: { params: ProjectIdParam },
  responses: {
    200: { description: "Queued", ...jsonBody(CrawlQueuedResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
    503: { description: "Redis/worker is not running", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/performance ------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/performance",
  tags: ["Performance"],
  summary: "Queue a PageSpeed Insights run",
  ...auth,
  request: { params: ProjectIdParam, body: jsonBody(RunPerformanceRequest) },
  responses: {
    200: { description: "Queued", ...jsonBody(RunPerformanceResponse) },
    400: { description: "No valid pages to run, or over the plan's page limit", ...jsonBody(ErrorResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
    409: { description: "A PageSpeed run is already in progress for this project", ...jsonBody(ErrorResponse) },
    503: { description: "Redis/worker is not running", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/competitors ------------------------------------------

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/competitors",
  tags: ["Competitors"],
  summary: "Add (or re-add) a competitor domain and queue its analysis",
  description:
    "Runs `assertSafeUrl` before accepting the domain; the error message is deliberately generic on that " +
    "failure so a caller cannot use it to probe for internal addresses. Re-adding a previously removed " +
    "competitor un-excludes it (200) rather than erroring on the unique constraint (201 for a new one).",
  ...auth,
  request: { params: ProjectIdParam, body: jsonBody(AddCompetitorRequest) },
  responses: {
    200: { description: "Re-added a previously excluded competitor", ...jsonBody(AddCompetitorResponse) },
    201: { description: "Added", ...jsonBody(AddCompetitorResponse) },
    400: {
      description: "Invalid domain, your own domain, a directory/platform domain, or an unsafe address",
      ...jsonBody(ErrorResponse),
    },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    403: { description: "Plan does not include competitors, or the competitor limit is reached", ...jsonBody(ErrorResponse) },
    404: { description: "Project not found", ...jsonBody(ErrorResponse) },
    409: { description: "Already tracked and not excluded", ...jsonBody(ErrorResponse) },
    503: { description: "Redis/worker is not running", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/competitors/{competitorId} ---------------------------

registry.registerPath({
  method: "patch",
  path: "/api/projects/{id}/competitors/{competitorId}",
  tags: ["Competitors"],
  summary: "Update a competitor's pinned/excluded/name fields",
  ...auth,
  request: { params: CompetitorIdParams, body: jsonBody(UpdateCompetitorRequest) },
  responses: {
    200: { description: "Updated", ...jsonBody(OkResponse) },
    400: { description: "Body had no recognized field set", ...jsonBody(ErrorResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/projects/{id}/competitors/{competitorId}",
  tags: ["Competitors"],
  summary: "Remove a competitor",
  description:
    "Soft-removes by default (`excluded = true`, so a later discovery run cannot resurrect it). " +
    "Pass `?hard=1` to permanently delete the row instead.",
  ...auth,
  request: { params: CompetitorIdParams, query: HardDeleteQuery },
  responses: {
    200: { description: "Removed", ...jsonBody(OkResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/competitors/{competitorId}/analyze",
  tags: ["Competitors"],
  summary: "Re-run analysis for one competitor",
  ...auth,
  request: { params: CompetitorIdParams },
  responses: {
    200: { description: "Queued", ...jsonBody(OkResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
    409: { description: "Already being analyzed", ...jsonBody(ErrorResponse) },
    503: { description: "Redis/worker is not running", ...jsonBody(ErrorResponse) },
  },
});

// There is no GET /api/projects/{id}/competitors: the competitors list is
// rendered by a server component reading Prisma directly (see
// apps/web/app/(dashboard)/projects/[id]/competitors/page.tsx), not exposed
// as JSON today. `Competitor` stays registered for reuse once PRD §31's
// dedicated list endpoint exists.
