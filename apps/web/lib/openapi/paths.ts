import { z } from "zod";
import { ErrorResponse, OkResponse, registry } from "./registry";
import {
  AddCompetitorRequest,
  AddCompetitorResponse,
  CompetitorIdParams,
  ContextResponse,
  CrawlQueuedResponse,
  CrawlRequest,
  CrawlTier,
  DiscoveryRequest,
  DiscoveryStateResponse,
  InventoryResponse,
  QueuedResponse,
  CreateProjectRequest,
  CreateProjectResponse,
  HardDeleteQuery,
  Opportunity,
  OpportunityIdParams,
  Project,
  ProjectDetail,
  ProjectIdParam,
  QueueResponse,
  RefreshOpportunitiesRequest,
  RefreshOpportunitiesResponse,
  RunPerformanceRequest,
  RunPerformanceResponse,
  UpdateCompetitorRequest,
  UpdateContextRequest,
  UpdateInventoryRequest,
  UpdateOpportunityRequest,
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
  summary: "Create a project and discover its pages",
  description:
    "Validates and normalizes the URL, then runs `assertSafeUrl` (SSRF check) before creating anything. " +
    "Refuses if the account is already at its plan's project limit. Queues page discovery, not a crawl: " +
    "the site's pages are found and classified Priority or Standard, and the user then starts the crawl " +
    "of its Priority pages (POST /api/projects/{id}/crawl). Nothing is charged until then.",
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
    "clearing every field and omitting `mode` drops the project back to Quick. On a plan without Deep " +
    "analysis (Free) the project stays Quick and no business context is stored.",
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
  summary: "Crawl pages of the site's page inventory",
  description:
    "Fetches pages SEO Maker already knows, each at its stored Priority or Standard tier: the ones named in " +
    "`pages`, or the inventory's Priority pages when none are (a new site's first crawl). Nothing is " +
    "discovered or re-classified; pages not chosen keep their last results. Non-destructive: this queues a " +
    "new `Crawl` row, and the project keeps serving its last completed crawl until the new one finishes. The " +
    "worker reads the plan's limits when the crawl runs.",
  ...auth,
  request: { params: ProjectIdParam, body: jsonBody(CrawlRequest) },
  responses: {
    200: { description: "Queued", ...jsonBody(CrawlQueuedResponse) },
    400: { description: "A page not in the inventory, more pages than the plan crawls at once, or no Priority page", ...jsonBody(ErrorResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "The plan's crawls of this site are used", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
    409: { description: "A crawl or a discovery is already running for this site", ...jsonBody(ErrorResponse) },
    503: { description: "Redis/worker is not running", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/discover ---------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/discover",
  tags: ["Crawling"],
  summary: "Page discovery progress and last result",
  ...auth,
  request: { params: ProjectIdParam },
  responses: {
    200: { description: "OK", ...jsonBody(DiscoveryStateResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/discover",
  tags: ["Crawling"],
  summary: "Discover pages without crawling them",
  description:
    "Reads robots.txt, the sitemaps and the homepage's links, and classifies pages Priority or Standard " +
    "deterministically. `new-pages` classifies and adds only pages not known yet; known pages keep their " +
    "classification and nothing is crawled. `initial` retries a new site's first discovery.",
  ...auth,
  request: { params: ProjectIdParam, body: jsonBody(DiscoveryRequest) },
  responses: {
    200: { description: "Queued, or already running", ...jsonBody(QueuedResponse) },
    400: { description: "No valid mode", ...jsonBody(ErrorResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
    409: { description: "A crawl is running, or the mode does not fit the site's state", ...jsonBody(ErrorResponse) },
    503: { description: "Redis/worker is not running", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/inventory --------------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/inventory",
  tags: ["Crawling"],
  summary: "The site's page inventory",
  description: "Every page discovery found, crawled or not, with its stored Priority / Standard classification.",
  ...auth,
  request: { params: ProjectIdParam },
  responses: {
    200: { description: "OK", ...jsonBody(InventoryResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/projects/{id}/inventory",
  tags: ["Crawling"],
  summary: "Move one page between Priority and Standard",
  description:
    "Changes that page's classification only: nothing is re-discovered or crawled, and every other page keeps " +
    "its tier. The plan's Priority cap is enforced here and again by the worker.",
  ...auth,
  request: { params: ProjectIdParam, body: jsonBody(UpdateInventoryRequest) },
  responses: {
    200: { description: "Saved", ...jsonBody(z.object({ ok: z.literal(true), pageKey: z.string(), tier: CrawlTier })) },
    400: { description: "Missing page key or tier", ...jsonBody(ErrorResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "The plan's Priority pages are all in use", ...jsonBody(ErrorResponse) },
    404: { description: "Project, or page in its inventory, not found", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/pages/{pageId}/crawl ----------------------------------

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/pages/{pageId}/crawl",
  tags: ["Crawling"],
  summary: "Crawl one page again",
  description:
    "Fetches this page only, at its own tier, and re-runs its checks: for checking a change made to it. " +
    "Nothing else is crawled, discovered or re-classified. Counts as a re-crawl on plans that limit them.",
  ...auth,
  request: { params: ProjectIdParam.extend({ pageId: z.string() }) },
  responses: {
    200: { description: "Queued, or already queued", ...jsonBody(QueuedResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "The plan's crawls of this site are used", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
    409: { description: "From an earlier crawl, or a crawl of the site is running", ...jsonBody(ErrorResponse) },
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
    402: { description: "The plan does not include PageSpeed (Free)", ...jsonBody(ErrorResponse) },
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
    403: { description: "The plan does not include competitors (Free)", ...jsonBody(ErrorResponse) },
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
    403: { description: "The plan does not include competitors (Free)", ...jsonBody(ErrorResponse) },
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

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/competitors/{competitorId}/insights",
  tags: ["Competitors"],
  summary: "Queue AI interpretation of one competitor comparison",
  description:
    "The comparison's facts are deterministic and refreshed with every analysis. This queues one model call " +
    "that interprets them, each interpretation tied to a fact id. Without business context no gap is called worth pursuing.",
  ...auth,
  request: { params: CompetitorIdParams, body: jsonBody(z.object({ force: z.boolean().optional() })) },
  responses: {
    200: { description: "Queued, or already queued", ...jsonBody(QueueResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "Plan does not include Competitor AI", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
    409: { description: "Competitor not analysed yet, or your site has no complete crawl", ...jsonBody(ErrorResponse) },
    429: { description: "The user's AI allowance is used up (Free: 2 a day, 10 a week), or AI is at capacity", ...jsonBody(ErrorResponse) },
    503: { description: "AI unavailable, or the queue is offline", ...jsonBody(ErrorResponse) },
  },
});

// --- /api/projects/{id}/opportunities ----------------------------------------

registry.registerPath({
  method: "get",
  path: "/api/projects/{id}/opportunities",
  tags: ["Opportunities"],
  summary: "List site and competitor opportunities, highest priority first",
  description: "Re-derives site opportunities first if the stored ones predate the latest crawl.",
  ...auth,
  request: { params: ProjectIdParam },
  responses: {
    200: { description: "OK", ...jsonBody(z.object({ opportunities: z.array(Opportunity) })) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "Free plan", ...jsonBody(ErrorResponse) },
    404: { description: "Project not found", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/projects/{id}/opportunities",
  tags: ["Opportunities"],
  summary: "Re-derive opportunities from the latest crawl, and optionally queue AI wording",
  description:
    "Deriving is deterministic and free: scores, bands and affected pages come from crawl evidence. With " +
    "`explain: true` the AI job rewrites the top opportunities' wording from the same facts; it cannot change a score.",
  ...auth,
  request: { params: ProjectIdParam, body: jsonBody(RefreshOpportunitiesRequest) },
  responses: {
    200: { description: "Derived, and queued when asked", ...jsonBody(RefreshOpportunitiesResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "Free plan, or AI requested on a plan without it", ...jsonBody(ErrorResponse) },
    404: { description: "Project not found", ...jsonBody(ErrorResponse) },
    409: { description: "No complete crawl yet", ...jsonBody(ErrorResponse) },
    429: { description: "The user's AI allowance is used up (Free: 2 a day, 10 a week), or AI is at capacity", ...jsonBody(ErrorResponse) },
    503: { description: "AI unavailable, or the queue is offline", ...jsonBody(ErrorResponse) },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/projects/{id}/opportunities/{opportunityId}",
  tags: ["Opportunities"],
  summary: "Set the user's status on an opportunity",
  description: "The user's claim. Whether a crawl still finds the condition is recorded separately as `resolvedAt`.",
  ...auth,
  request: { params: OpportunityIdParams, body: jsonBody(UpdateOpportunityRequest) },
  responses: {
    200: { description: "Updated", ...jsonBody(z.object({ ok: z.literal(true), status: z.string() })) },
    400: { description: "Unknown status", ...jsonBody(ErrorResponse) },
    401: { description: "Not signed in", ...jsonBody(ErrorResponse) },
    402: { description: "Free plan", ...jsonBody(ErrorResponse) },
    404: { description: "Not found", ...jsonBody(ErrorResponse) },
  },
});
