/**
 * Discover first, then crawl: the crawl flow through the real route handlers,
 * against a real database.
 *
 *   add a site        -> discovery is queued; nothing is crawled or charged
 *   start the crawl   -> the Priority pages only
 *   Make Priority     -> one page's classification changes, nothing else
 *   Re-crawl Site     -> exactly the chosen pages; no re-classification
 *   Check for new     -> discovery of new pages only; nothing is crawled
 *   Crawl Page        -> that page only, counted as a re-crawl on Free
 *
 * Clerk and the job queue are replaced; everything else is production code.
 *
 *   SEO_MAKER_DB_TESTS=1 pnpm --filter web test:routes
 */

import { randomUUID } from "node:crypto";
import { pageKeyOf } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";

const state = vi.hoisted(() => ({ userId: null as string | null }));
const queue = vi.hoisted(() => ({
  crawl: vi.fn(async (_data: unknown) => {}),
  crawlPage: vi.fn(async (_data: unknown) => {}),
  discover: vi.fn(async (_data: unknown) => {}),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  currentUser: async () => null,
}));

vi.mock("@/lib/queue", () => ({
  enqueueHomepageCrawl: (data: unknown) => queue.crawl(data),
  enqueueCrawlPage: (data: unknown) => queue.crawlPage(data),
  enqueueDiscovery: (data: unknown) => queue.discover(data),
  getCrawlPageJobs: async () => [],
  getCrawlQueueState: async () => ({ workerOnline: true, waitingPosition: null }),
  removeQueuedCrawl: async () => ({ removed: 0, usageIds: [] }),
}));

const enabled = process.env.SEO_MAKER_DB_TESTS === "1";
const run = randomUUID().slice(0, 8);
const FREE = `test_flow_free_${run}`;
const PRO = `test_flow_pro_${run}`;

function request(method: string, body: unknown) {
  return new Request("http://test.local/api", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const post = (body: unknown) => request("POST", body);
const patch = (body: unknown) => request("PATCH", body);
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

type Seeded = { project: string; siteKey: string; home: string; pages: Record<string, string> };
const sites: Record<string, Seeded> = {};

/**
 * A site after discovery: an inventory of five pages, two of them Priority.
 * With `crawled`, a completed crawl of the Priority pages too.
 */
async function seed(userId: string, plan: string, options: { crawled: boolean }) {
  const siteKey = `example.com/flow-${plan}-${run}`;
  const root = `https://${siteKey}`;
  await prisma.account.upsert({
    where: { userId },
    create: { userId, email: `${userId}@test.local`, plan },
    update: {},
  });
  const project = await prisma.project.create({
    data: {
      userId,
      rootUrl: root,
      siteKey,
      name: siteKey,
      maxPages: plan === "free" ? 1 : 10,
      status: options.crawled ? "analyzed" : "discovered",
      discoveryStatus: "done",
      discoveryMode: "initial",
    },
  });
  const paths = { "/": "priority", "/pricing": plan === "free" ? "standard" : "priority", "/about": "standard", "/blog": "standard", "/careers": "standard" } as const;
  const pages: Record<string, string> = {};
  for (const [path, tier] of Object.entries(paths)) {
    const url = path === "/" ? root : `${root}${path}`;
    await prisma.sitePage.create({
      data: {
        projectId: project.id,
        url,
        pageKey: pageKeyOf(url),
        path,
        homepage: path === "/",
        tier,
        autoTier: tier,
        level: tier === "priority" ? "high" : "medium",
      },
    });
    pages[path] = pageKeyOf(url);
  }
  let home = "";
  if (options.crawled) {
    const crawl = await prisma.crawl.create({
      data: { projectId: project.id, status: "completed", phase: "done", maxPages: 2, analyzed: 1, crawled: 1, finishedAt: new Date() },
    });
    const page = await prisma.page.create({
      data: { projectId: project.id, crawlId: crawl.id, url: root, status: "analyzed", statusCode: 200, crawlTier: "priority", title: "Home" },
    });
    home = page.id;
    await prisma.project.update({ where: { id: project.id }, data: { latestCrawlId: crawl.id } });
    await prisma.usageRecord.create({ data: { userId, kind: "crawl", scope: "initial", siteKey, projectId: project.id, status: "succeeded" } });
  }
  sites[userId] = { project: project.id, siteKey, home, pages };
}

async function tiers(projectId: string) {
  const rows = await prisma.sitePage.findMany({ where: { projectId }, select: { path: true, tier: true, tierSource: true } });
  return Object.fromEntries(rows.map((row) => [row.path, `${row.tier}:${row.tierSource}`]));
}

beforeAll(async () => {
  if (!enabled) return;
  await seed(PRO, "pro", { crawled: true });
  await seed(FREE, "free", { crawled: true });
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

describe.skipIf(!enabled)("adding a site", () => {
  const user = `test_flow_new_${run}`;
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { userId: user } });
    await prisma.usageRecord.deleteMany({ where: { userId: user } });
    await prisma.account.deleteMany({ where: { userId: user } });
  });

  it("discovers its pages first: no crawl is queued and nothing is charged", async () => {
    state.userId = user;
    await prisma.account.create({ data: { userId: user, email: `${user}@test.local`, plan: "pro" } });
    const projects = await import("@/app/api/projects/route");
    const response = await projects.POST(post({ url: `https://example.com/flow-new-${run}` }));
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };

    expect(queue.discover).toHaveBeenCalledWith({ projectId: id, mode: "initial" });
    expect(queue.crawl).not.toHaveBeenCalled();
    const project = await prisma.project.findUniqueOrThrow({ where: { id } });
    expect(project.status).toBe("discovering");
    expect(project.discoveryStatus).toBe("queued");
    expect(await prisma.page.count({ where: { projectId: id } })).toBe(0);
    expect(await prisma.usageRecord.count({ where: { userId: user } })).toBe(0);
  });

  it("starts the crawl of the Priority pages once discovery is done, and charges it as the first crawl", async () => {
    state.userId = user;
    const project = await prisma.project.findFirstOrThrow({ where: { userId: user } });
    // Discovery found two pages: the homepage as Priority, /docs as Standard.
    for (const [path, tier] of [["", "priority"], ["/docs", "standard"]] as const) {
      const url = `${project.rootUrl}${path}`;
      await prisma.sitePage.create({
        data: { projectId: project.id, url, pageKey: pageKeyOf(url), path: path || "/", homepage: !path, tier, autoTier: tier, level: "high" },
      });
    }
    await prisma.project.update({ where: { id: project.id }, data: { status: "discovered", discoveryStatus: "done" } });

    const crawl = await import("@/app/api/projects/[id]/crawl/route");
    const response = await crawl.POST(post({}), params({ id: project.id }));
    expect(response.status).toBe(200);
    // No pages named: the worker crawls the inventory's Priority pages.
    expect(queue.crawl).toHaveBeenCalledWith(expect.objectContaining({ projectId: project.id, targets: undefined, scope: "initial" }));
    expect(await prisma.usageRecord.count({ where: { userId: user, kind: "crawl", scope: "initial" } })).toBe(1);
  });

  it("will not crawl while discovery is still running", async () => {
    state.userId = user;
    const project = await prisma.project.findFirstOrThrow({ where: { userId: user } });
    await prisma.project.update({ where: { id: project.id }, data: { status: "discovering", discoveryStatus: "running" } });
    const crawl = await import("@/app/api/projects/[id]/crawl/route");
    const response = await crawl.POST(post({}), params({ id: project.id }));
    expect(response.status).toBe(409);
    expect(queue.crawl).not.toHaveBeenCalled();
  });
});

describe.skipIf(!enabled)("Priority and Standard pages", () => {
  it("makes a Standard page Priority without touching any other page", async () => {
    state.userId = PRO;
    const before = await tiers(sites[PRO].project);
    const inventory = await import("@/app/api/projects/[id]/inventory/route");
    const response = await inventory.PATCH(patch({ pageKey: sites[PRO].pages["/about"], tier: "priority" }), params({ id: sites[PRO].project }));
    expect(response.status).toBe(200);

    const after = await tiers(sites[PRO].project);
    expect(after["/about"]).toBe("priority:user");
    for (const path of ["/", "/pricing", "/blog", "/careers"]) expect(after[path]).toBe(before[path]);
    expect(queue.crawl).not.toHaveBeenCalled();
    expect(queue.discover).not.toHaveBeenCalled();
  });

  it("refuses a Priority page past the plan's cap, and says how to get more", async () => {
    state.userId = FREE;
    const inventory = await import("@/app/api/projects/[id]/inventory/route");
    const response = await inventory.PATCH(patch({ pageKey: sites[FREE].pages["/pricing"], tier: "priority" }), params({ id: sites[FREE].project }));
    const data = await response.json();
    expect(response.status).toBe(402);
    expect(data.code).toBe("priority-limit");
    expect(data.upgrade).toBe(true);
    expect((await tiers(sites[FREE].project))["/pricing"]).toBe("standard:auto");
  });

  it("refuses a page that is not in the inventory", async () => {
    state.userId = PRO;
    const inventory = await import("@/app/api/projects/[id]/inventory/route");
    const response = await inventory.PATCH(patch({ pageKey: "elsewhere.com/x", tier: "priority" }), params({ id: sites[PRO].project }));
    expect(response.status).toBe(404);
  });
});

describe.skipIf(!enabled)("Re-crawl Site", () => {
  it("crawls exactly the pages chosen, Priority and Standard alike, without re-classifying any", async () => {
    state.userId = PRO;
    const before = await tiers(sites[PRO].project);
    const crawl = await import("@/app/api/projects/[id]/crawl/route");
    const chosen = [sites[PRO].pages["/pricing"], sites[PRO].pages["/careers"]];
    const response = await crawl.POST(post({ pages: chosen, scope: "recrawl" }), params({ id: sites[PRO].project }));
    expect(response.status).toBe(200);
    expect(queue.crawl).toHaveBeenCalledWith(expect.objectContaining({ targets: chosen, scope: "recrawl" }));
    expect(await tiers(sites[PRO].project)).toEqual(before);
    await prisma.project.update({ where: { id: sites[PRO].project }, data: { status: "analyzed" } });
  });

  it("refuses pages outside the inventory and more pages than one crawl holds", async () => {
    state.userId = PRO;
    const crawl = await import("@/app/api/projects/[id]/crawl/route");
    const unknown = await crawl.POST(post({ pages: ["elsewhere.com/x"] }), params({ id: sites[PRO].project }));
    expect(unknown.status).toBe(400);
    const tooMany = await crawl.POST(post({ pages: Array.from({ length: 11 }, (_, i) => `k${i}`) }), params({ id: sites[PRO].project }));
    expect(tooMany.status).toBe(400);
    expect(queue.crawl).not.toHaveBeenCalled();
  });
});

describe.skipIf(!enabled)("Check for New Pages", () => {
  it("queues discovery of new pages only: nothing is crawled or re-classified", async () => {
    state.userId = PRO;
    const before = await tiers(sites[PRO].project);
    const discover = await import("@/app/api/projects/[id]/discover/route");
    const response = await discover.POST(post({ mode: "new-pages" }), params({ id: sites[PRO].project }));
    expect(response.status).toBe(200);
    expect(queue.discover).toHaveBeenCalledWith({ projectId: sites[PRO].project, mode: "new-pages" });
    expect(queue.crawl).not.toHaveBeenCalled();
    expect(await tiers(sites[PRO].project)).toEqual(before);

    // A second press while it runs reuses it.
    const again = await discover.POST(post({ mode: "new-pages" }), params({ id: sites[PRO].project }));
    expect((await again.json()).queued).toBe(false);
    expect(queue.discover).toHaveBeenCalledTimes(1);
  });

  it("reports what the check found", async () => {
    state.userId = PRO;
    const result = {
      mode: "new-pages",
      at: new Date().toISOString(),
      total: 7,
      priority: 1,
      standard: 1,
      added: [
        { url: "https://example.com/enterprise", pageKey: "example.com/enterprise", path: "/enterprise", tier: "priority", pageType: "product", level: "high" },
        { url: "https://example.com/blog/new", pageKey: "example.com/blog/new", path: "/blog/new", tier: "standard", pageType: "article", level: "medium" },
      ],
      addedNotListed: 0,
      sitemapUrls: 7,
      robotsFound: true,
      homepageError: null,
      counts: { eligible: 7, blocked_by_robots: 0, invalid: 0, duplicate: 0, asset: 0, external: 0 },
    };
    await prisma.project.update({
      where: { id: sites[PRO].project },
      data: { discoveryStatus: "done", discoveryResult: result },
    });
    const discover = await import("@/app/api/projects/[id]/discover/route");
    const response = await discover.GET(new Request("http://test.local/api"), params({ id: sites[PRO].project }));
    const data = await response.json();
    expect(data.status).toBe("done");
    expect(data.mode).toBe("new-pages");
    expect(data.result.added.map((row: { path: string }) => row.path)).toEqual(["/enterprise", "/blog/new"]);
  });
});

describe.skipIf(!enabled)("Crawl Page", () => {
  it("queues this page only, charged as a single-page crawl", async () => {
    state.userId = PRO;
    const pageCrawl = await import("@/app/api/projects/[id]/pages/[pageId]/crawl/route");
    const response = await pageCrawl.POST(post({}), params({ id: sites[PRO].project, pageId: sites[PRO].home }));
    expect(response.status).toBe(200);
    expect(queue.crawlPage).toHaveBeenCalledWith(expect.objectContaining({ pageId: sites[PRO].home, mode: "recrawl" }));
    expect(queue.crawl).not.toHaveBeenCalled();
    expect(queue.discover).not.toHaveBeenCalled();
    expect(await prisma.usageRecord.count({ where: { userId: PRO, kind: "crawl", scope: "page" } })).toBe(1);
  });

  it("counts as the one re-crawl on Free", async () => {
    state.userId = FREE;
    const pageCrawl = await import("@/app/api/projects/[id]/pages/[pageId]/crawl/route");
    const first = await pageCrawl.POST(post({}), params({ id: sites[FREE].project, pageId: sites[FREE].home }));
    expect(first.status).toBe(200);
    const second = await pageCrawl.POST(post({}), params({ id: sites[FREE].project, pageId: sites[FREE].home }));
    expect(second.status).toBe(402);
    expect((await second.json()).code).toBe("recrawl-limit");
  });
});
