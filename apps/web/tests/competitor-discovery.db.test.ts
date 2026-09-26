/**
 * Competitor discovery and search keyword routes, through the real route
 * handlers against a real database. Clerk and the job queue are replaced;
 * nothing reaches a search provider or a model.
 *
 *   SEO_MAKER_DB_TESTS=1 pnpm --filter web test:routes
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@seo-maker/db";

const state = vi.hoisted(() => ({ userId: null as string | null }));
const queue = vi.hoisted(() => ({
  discover: vi.fn(async (_data: unknown) => {}),
  site: vi.fn(async (_data: unknown) => {}),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  currentUser: async () => null,
}));

vi.mock("@/lib/queue", () => ({
  enqueueCompetitorDiscover: (data: unknown) => queue.discover(data),
  enqueueAiSiteAnalysis: (data: unknown) => queue.site(data),
  getAiSiteJobs: async () => [],
}));

const enabled = process.env.SEO_MAKER_DB_TESTS === "1";
const run = randomUUID().slice(0, 8);
const PRO = `test_disc_${run}`;
let projectId = "";

function post(body: unknown = {}) {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

beforeAll(async () => {
  if (!enabled) return;
  await prisma.account.create({ data: { userId: PRO, email: `${PRO}@test.local`, plan: "pro" } });
  const project = await prisma.project.create({
    data: { userId: PRO, rootUrl: `https://example.com/disc-${run}`, siteKey: `example.com/disc-${run}`, name: `disc-${run}`, status: "analyzed" },
  });
  projectId = project.id;
});

afterAll(async () => {
  if (!enabled) return;
  await prisma.usageRecord.deleteMany({ where: { userId: PRO } });
  await prisma.project.deleteMany({ where: { userId: PRO } });
  await prisma.account.deleteMany({ where: { userId: PRO } });
  await prisma.$disconnect();
});

beforeEach(() => {
  state.userId = PRO;
  queue.discover.mockClear();
  queue.site.mockClear();
});

describe.skipIf(!enabled)("POST /api/projects/[id]/competitors/discover", () => {
  it("refuses without a search results provider", async () => {
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    const { POST } = await import("@/app/api/projects/[id]/competitors/discover/route");
    const response = await POST(post(), params({ id: projectId }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("no-provider");
    expect(queue.discover).not.toHaveBeenCalled();
  });

  it("asks for the business profile instead of discovering blind", async () => {
    process.env.DATAFORSEO_LOGIN = "test";
    process.env.DATAFORSEO_PASSWORD = "test";
    const { POST } = await import("@/app/api/projects/[id]/competitors/discover/route");
    const response = await POST(post(), params({ id: projectId }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe("profile-required");
    expect(body.missing.map((gap: { field: string }) => gap.field)).toEqual([
      "businessType",
      "targetLocation",
      "targetAudience",
      "servicesProducts",
      "businessDescription",
    ]);
    expect(queue.discover).not.toHaveBeenCalled();
  });

  it("queues discovery once the profile names a market", async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        businessType: "SaaS",
        businessDescription: "Payments for online businesses.",
        targetAudience: "Online retailers",
        targetLocation: "Addis Ababa, Ethiopia",
        servicesProducts: ["Payments", "Billing"],
      },
    });
    const { POST } = await import("@/app/api/projects/[id]/competitors/discover/route");
    const response = await POST(post({ requestId: `req-${run}-1` }), params({ id: projectId }));
    expect(response.status).toBe(202);
    expect(queue.discover).toHaveBeenCalledTimes(1);
    expect(queue.discover.mock.calls[0][0]).toMatchObject({ projectId, mode: "full" });
    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(project.compStatus).toBe("queued");
  });

  it("does not queue a second run while one is in flight", async () => {
    const { POST } = await import("@/app/api/projects/[id]/competitors/discover/route");
    const response = await POST(post({ requestId: `req-${run}-2` }), params({ id: projectId }));
    expect(response.status).toBe(200);
    expect((await response.json()).queued).toBe(false);
    expect(queue.discover).not.toHaveBeenCalled();
  });
});

describe.skipIf(!enabled)("/api/projects/[id]/search-queries", () => {
  it("queues keyword generation on the Site AI queue", async () => {
    const { POST } = await import("@/app/api/projects/[id]/search-queries/route");
    const response = await POST(post({ requestId: `req-${run}-kw` }), params({ id: projectId }));
    expect(response.status).toBe(202);
    expect(queue.site).toHaveBeenCalledTimes(1);
    expect(queue.site.mock.calls[0][0]).toMatchObject({ projectId, task: "search-queries", force: false });
  });

  it("lists stored keywords with an encoded Google link, in the project's market", async () => {
    await prisma.competitorQuery.create({
      data: { projectId, query: "payment gateway ethiopia", source: "ai", intent: "commercial", priority: "high", reason: "Core", locationCode: 2231, languageCode: "en" },
    });
    // Another market's row is not the current set.
    await prisma.competitorQuery.create({
      data: { projectId, query: "payment gateway usa", source: "ai", intent: "commercial", priority: "high", locationCode: 2840, languageCode: "en" },
    });
    const { GET } = await import("@/app/api/projects/[id]/search-queries/route");
    const response = await GET(new Request("http://test.local/api"), params({ id: projectId }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.market).toEqual({ country: "Ethiopia", languageCode: "en" });
    expect(body.keywords).toHaveLength(1);
    expect(body.keywords[0]).toMatchObject({
      query: "payment gateway ethiopia",
      priority: "high",
      googleUrl: "https://www.google.com/search?q=payment%20gateway%20ethiopia",
    });
  });

  it("refuses another user's project", async () => {
    state.userId = `someone_else_${run}`;
    const { GET } = await import("@/app/api/projects/[id]/search-queries/route");
    const response = await GET(new Request("http://test.local/api"), params({ id: projectId }));
    expect(response.status).toBe(404);
  });
});
