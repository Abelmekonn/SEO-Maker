/**
 * Plan enforcement through the real route handlers, against a real database.
 *
 * Only two things are replaced: Clerk (the signed-in user is set per test)
 * and the job queue (enqueues are recorded instead of sent to Redis). The
 * plan table, the usage ledger, the homepage rule and every response come
 * from production code.
 *
 *   SEO_MAKER_DB_TESTS=1 pnpm --filter web test:routes
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@seo-maker/db";

const state = vi.hoisted(() => ({ userId: null as string | null }));
const queue = vi.hoisted(() => ({
  page: vi.fn(async (_data: unknown) => {}),
  site: vi.fn(async (_data: unknown) => {}),
  competitor: vi.fn(async (_data: unknown) => {}),
  crawl: vi.fn(async (_data: unknown) => {}),
  crawlPage: vi.fn(async (_data: unknown) => {}),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  currentUser: async () => null,
}));

vi.mock("@/lib/queue", () => ({
  enqueueAiPageAnalysis: (data: unknown) => queue.page(data),
  enqueueAiSiteAnalysis: (data: unknown) => queue.site(data),
  enqueueAiCompetitorInsight: (data: unknown) => queue.competitor(data),
  enqueueHomepageCrawl: (data: unknown) => queue.crawl(data),
  enqueueCrawlPage: (data: unknown) => queue.crawlPage(data),
  enqueueDiscovery: async () => {},
  getCrawlQueueState: async () => ({ workerOnline: true, waitingPosition: null }),
  getAiQueueJobs: async () => [],
  getAiSiteJobs: async () => [],
  getAiCompetitorJobs: async () => [],
  getCrawlPageJobs: async () => [],
  getAiStopAt: async () => null,
  removeQueuedCrawl: async () => ({ removed: 0, usageIds: [] }),
  removeProjectJobs: async () => ({ removed: 0, usageIds: [] }),
  stopAiWork: async () => ({ removed: 0, running: 0, usageIds: [] }),
}));

const enabled = process.env.SEO_MAKER_DB_TESTS === "1";
const run = randomUUID().slice(0, 8);
const FREE = `test_free_${run}`;
const PRO = `test_pro_${run}`;
const ids: Record<string, { project: string; home: string; about: string; siteKey: string }> = {};

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

async function seed(userId: string, plan: string) {
  // A resolvable host with a unique path: creating a project resolves the host first.
  const siteKey = `example.com/${plan}-${run}`;
  await prisma.account.create({ data: { userId, email: `${userId}@test.local`, plan } });
  const project = await prisma.project.create({
    data: { userId, rootUrl: `https://${siteKey}`, siteKey, name: siteKey, maxPages: plan === "free" ? 1 : 10, status: "analyzed" },
  });
  const crawl = await prisma.crawl.create({
    data: { projectId: project.id, status: "completed", phase: "done", maxPages: 10, analyzed: 2, crawled: 2, finishedAt: new Date() },
  });
  const evidence = { headings: [{ level: 2, text: "Why us" }], links: [], images: [], schema: [], openGraph: {}, twitter: {} };
  const home = await prisma.page.create({
    data: {
      projectId: project.id,
      crawlId: crawl.id,
      url: `https://${siteKey}`,
      status: "analyzed",
      statusCode: 200,
      discoveredVia: "seed",
      crawlTier: "priority",
      pageType: "homepage",
      pageTypeScore: 1,
      title: "Acme payments",
      h1: "Payments for retailers",
      wordCount: 600,
      content: "Acme helps retailers accept payments online. ".repeat(40),
      missingAlt: 0,
      imageCount: 0,
      evidence,
    },
  });
  const about = await prisma.page.create({
    data: {
      projectId: project.id,
      crawlId: crawl.id,
      url: `https://${siteKey}/about`,
      status: "analyzed",
      statusCode: 200,
      discoveredVia: "link",
      crawlTier: "standard",
      pageType: "about",
      pageTypeScore: 0.9,
      title: "About Acme",
      wordCount: 300,
      evidence,
    },
  });
  await prisma.pageIssue.create({
    data: { pageId: home.id, crawlId: crawl.id, checkId: "meta", status: "fail", severity: "high", message: "Has a meta description" },
  });
  await prisma.pageIssue.create({
    data: { pageId: about.id, crawlId: crawl.id, checkId: "meta", status: "fail", severity: "high", message: "Has a meta description" },
  });
  await prisma.project.update({ where: { id: project.id }, data: { latestCrawlId: crawl.id } });
  // The first crawl, as creating the project would have recorded it.
  await prisma.usageRecord.create({
    data: { userId, kind: "crawl", scope: "initial", siteKey, projectId: project.id, status: "succeeded" },
  });
  ids[userId] = { project: project.id, home: home.id, about: about.id, siteKey };
}

beforeAll(async () => {
  if (!enabled) return;
  process.env.AI_API_KEY_GROQ = process.env.AI_API_KEY_GROQ || "test-key";
  await seed(FREE, "free");
  await seed(PRO, "pro");
});

afterAll(async () => {
  if (!enabled) return;
  await prisma.project.deleteMany({ where: { userId: { in: [FREE, PRO] } } });
  await prisma.usageRecord.deleteMany({ where: { userId: { in: [FREE, PRO] } } });
  await prisma.account.deleteMany({ where: { userId: { in: [FREE, PRO] } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  for (const spy of Object.values(queue)) spy.mockClear();
});

describe.skipIf(!enabled)("Free plan, enforced on the server", () => {
  it("queues Page AI on the homepage and charges the allowance", async () => {
    state.userId = FREE;
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    const response = await POST(post({ pageId: ids[FREE].home, outputs: ["metadata"] }), params({ id: ids[FREE].project }));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.queued).toBe(1);
    expect(data.quota.daily.remaining).toBe(1);
    const job = queue.page.mock.calls[0][0] as { features: string[]; usageId: string };
    expect(job.features).toEqual(["title", "meta"]);
    expect(job.usageId).toBeTruthy();
  });

  it("charges a retried request once", async () => {
    state.userId = FREE;
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    const key = randomUUID().replace(/-/g, "");
    const first = await (await POST(post({ pageId: ids[FREE].home, outputs: ["headings"] }, { "idempotency-key": key }), params({ id: ids[FREE].project }))).json();
    const retry = await (await POST(post({ pageId: ids[FREE].home, outputs: ["headings"] }, { "idempotency-key": key }), params({ id: ids[FREE].project }))).json();
    expect(first.queued).toBe(1);
    expect(retry.queued).toBe(0);
    expect(queue.page).toHaveBeenCalledTimes(1);
  });

  it("stops at 2 generations a day, saying when the next frees up, without tokens", async () => {
    state.userId = FREE;
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    const response = await POST(post({ pageId: ids[FREE].home, outputs: ["content"] }), params({ id: ids[FREE].project }));
    const data = await response.json();
    expect(response.status).toBe(429);
    expect(data.code).toBe("quota");
    expect(data.error).toMatch(/today's 2 AI generations/);
    expect(JSON.stringify(data)).not.toMatch(/token/i);
    expect(queue.page).not.toHaveBeenCalled();
  });

  it("gives a failed generation back", async () => {
    state.userId = FREE;
    const record = await prisma.usageRecord.findFirst({ where: { userId: FREE, kind: "ai", status: "reserved" } });
    await prisma.usageRecord.update({ where: { id: record!.id }, data: { status: "failed", settledAt: new Date() } });
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    const response = await POST(post({ pageId: ids[FREE].home, outputs: ["content"] }), params({ id: ids[FREE].project }));
    expect(response.status).toBe(200);
  });

  it("refuses Page AI beyond the homepage", async () => {
    state.userId = FREE;
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    const response = await POST(post({ pageId: ids[FREE].about, outputs: ["metadata"] }), params({ id: ids[FREE].project }));
    const data = await response.json();
    expect(response.status).toBe(402);
    expect(data.code).toBe("homepage-only");
  });

  it("refuses a batch", async () => {
    state.userId = FREE;
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    const response = await POST(post({ next: 5 }), params({ id: ids[FREE].project }));
    expect(response.status).toBe(402);
  });

  it("refuses Competitor AI and Site AI", async () => {
    state.userId = FREE;
    const competitor = await prisma.competitor.create({
      data: { projectId: ids[FREE].project, domain: `rival-${run}.example`, source: "manual", status: "ready" },
    });
    const insights = await import("@/app/api/projects/[id]/competitors/[competitorId]/insights/route");
    const competitorResponse = await insights.POST(post({}), params({ id: ids[FREE].project, competitorId: competitor.id }));
    expect(competitorResponse.status).toBe(402);
    expect((await competitorResponse.json()).error).toMatch(/Competitor AI/);

    const site = await import("@/app/api/projects/[id]/ai/site/route");
    const siteResponse = await site.POST(post({ task: "strategy" }), params({ id: ids[FREE].project }));
    expect(siteResponse.status).toBe(402);
    expect(queue.competitor).not.toHaveBeenCalled();
    expect(queue.site).not.toHaveBeenCalled();
  });

  it("allows one re-crawl after the first crawl, then asks to upgrade", async () => {
    state.userId = FREE;
    const crawl = await import("@/app/api/projects/[id]/crawl/route");
    const first = await crawl.POST(post({}), params({ id: ids[FREE].project }));
    expect(first.status).toBe(200);
    const job = queue.crawl.mock.calls[0][0] as { usageId: string };
    expect(job.usageId).toBeTruthy();

    // The re-crawl finished, so the project is idle again.
    await prisma.project.update({ where: { id: ids[FREE].project }, data: { status: "analyzed" } });
    const second = await crawl.POST(post({}), params({ id: ids[FREE].project }));
    const data = await second.json();
    expect(second.status).toBe(402);
    expect(data.code).toBe("recrawl-limit");
    expect(data.upgrade).toBe(true);
  });

  it("keeps the re-crawl count when the site is deleted and added again", async () => {
    state.userId = FREE;
    await prisma.project.delete({ where: { id: ids[FREE].project } });
    const projects = await import("@/app/api/projects/route");
    const response = await projects.POST(post({ url: `https://${ids[FREE].siteKey}` }));
    const data = await response.json();
    expect(response.status).toBe(402);
    expect(data.code).toBe("recrawl-limit");
    expect(await prisma.project.count({ where: { userId: FREE } })).toBe(0);
  });
});

describe.skipIf(!enabled)("Pro plan", () => {
  it("runs Page AI on any page, with no daily cap", async () => {
    state.userId = PRO;
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    for (const output of ["metadata", "headings", "content"]) {
      const response = await POST(post({ pageId: ids[PRO].home, outputs: [output] }), params({ id: ids[PRO].project }));
      expect(response.status).toBe(200);
    }
    expect(queue.page).toHaveBeenCalledTimes(3);
  });

  it("refuses, without charging, an output the page has no evidence for", async () => {
    state.userId = PRO;
    const before = await prisma.usageRecord.count({ where: { userId: PRO, kind: "ai" } });
    const { POST } = await import("@/app/api/projects/[id]/analyze/route");
    // The About page is Standard: no text was kept, so there is nothing to write content from.
    const response = await POST(post({ pageId: ids[PRO].about, outputs: ["content"] }), params({ id: ids[PRO].project }));
    const data = await response.json();
    expect(response.status).toBe(422);
    expect(data.error).toMatch(/Priority/);
    expect(await prisma.usageRecord.count({ where: { userId: PRO, kind: "ai" } })).toBe(before);
  });

  it("queues Site AI", async () => {
    state.userId = PRO;
    const site = await import("@/app/api/projects/[id]/ai/site/route");
    const response = await site.POST(post({ task: "strategy" }), params({ id: ids[PRO].project }));
    expect(response.status).toBe(200);
    expect((queue.site.mock.calls[0][0] as { task: string }).task).toBe("strategy");
  });

  it("lets Competitor AI through the plan gate, and waits for collected evidence", async () => {
    state.userId = PRO;
    const competitor = await prisma.competitor.create({
      data: { projectId: ids[PRO].project, domain: `rival-${run}.example`, source: "manual", status: "crawling" },
    });
    const insights = await import("@/app/api/projects/[id]/competitors/[competitorId]/insights/route");
    const response = await insights.POST(post({}), params({ id: ids[PRO].project, competitorId: competitor.id }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/collected evidence/);
  });

  it("reports a competitor being crawled as running, with its pages, for the sidebar", async () => {
    state.userId = PRO;
    await prisma.competitor.create({
      data: {
        projectId: ids[PRO].project,
        domain: `crawling-${run}.example`,
        source: "manual",
        status: "crawling",
        crawlDone: 3,
        crawlTotal: 10,
      },
    });
    const activity = await import("@/app/api/projects/[id]/activity/route");
    const response = await activity.GET(new Request("http://test.local/api"), params({ id: ids[PRO].project }));
    const data = (await response.json()) as { competitors: { running: boolean; done: number; total: number } };
    // Discovery never ran, so the project's own competitor status is idle.
    expect(data.competitors.running).toBe(true);
    expect(data.competitors.done).toBeGreaterThanOrEqual(3);
    expect(data.competitors.total).toBeGreaterThanOrEqual(10);
  });

  it("queues a Priority fetch for a Standard page", async () => {
    state.userId = PRO;
    const priority = await import("@/app/api/projects/[id]/pages/[pageId]/priority/route");
    const response = await priority.POST(post({}), params({ id: ids[PRO].project, pageId: ids[PRO].about }));
    expect(response.status).toBe(200);
    expect(queue.crawlPage).toHaveBeenCalledWith(expect.objectContaining({ pageId: ids[PRO].about, path: expect.stringMatching(/\/about$/) }));
  });

  it("reports AI status with a quota and no token figures", async () => {
    state.userId = PRO;
    const status = await import("@/app/api/projects/[id]/ai/status/route");
    const response = await status.GET(new Request("http://test.local"), params({ id: ids[PRO].project }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toMatch(/"quota"/);
    expect(text).not.toMatch(/token|cost|budget/i);
  });
});

describe.skipIf(!enabled)("sites and search", () => {
  beforeAll(async () => {
    for (const name of ["alpha", "beta", "gamma"]) {
      await prisma.project.create({
        data: { userId: PRO, rootUrl: `https://${name}-${run}.example`, siteKey: `${name}-${run}.example`, name: `${name}-${run}.example` },
      });
    }
  });

  it("paginates, searches and sorts on the server", async () => {
    state.userId = PRO;
    const { GET } = await import("@/app/api/sites/route");
    const paged = await (await GET(new Request("http://test.local/api/sites?pageSize=2&sort=name&dir=asc"))).json();
    expect(paged.total).toBe(4);
    expect(paged.pageCount).toBe(2);
    expect(paged.items.map((site: { name: string }) => site.name)).toEqual([`alpha-${run}.example`, `beta-${run}.example`]);

    const searched = await (await GET(new Request(`http://test.local/api/sites?q=gamma`))).json();
    expect(searched.items).toHaveLength(1);

    const future = await (await GET(new Request("http://test.local/api/sites?from=2999-01-01"))).json();
    expect(future.total).toBe(0);
  });

  it("does not treat % in a search as a wildcard", async () => {
    state.userId = PRO;
    const { GET } = await import("@/app/api/sites/route");
    const data = await (await GET(new Request("http://test.local/api/sites?q=%25"))).json();
    expect(data.total).toBe(0);
  });

  it("finds a page of the user's own sites only", async () => {
    state.userId = PRO;
    const { GET } = await import("@/app/api/search/route");
    const data = await (await GET(new Request(`http://test.local/api/search?q=About%20Acme&project=${ids[PRO].project}`))).json();
    expect(data.pages.items.length).toBeGreaterThan(0);
    for (const page of data.pages.items) expect(page.projectId).toBe(ids[PRO].project);
    const screens = await (await GET(new Request(`http://test.local/api/search?q=strategy&project=${ids[PRO].project}`))).json();
    expect(screens.destinations.some((row: { href: string }) => row.href.endsWith("/ai/site"))).toBe(true);
  });
});
