import { randomUUID } from "node:crypto";
import { COMPETITOR_POLICY, type GeneratedSearchQuery } from "@seo-maker/core/competitors";
import type { SerpProvider, SerpRequest } from "@seo-maker/core/serp";
import { prisma } from "@seo-maker/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeCompetitor } from "./analysis";
import { loadProjectSearchContext } from "./context";
import { resolveDiscoveredCompetitor, runDiscoverySearch } from "./discovery";
import { getCompetitorSearchEvidence } from "./evidence";
import { type GenerateQueriesResult, saveGeneratedQueries } from "./queries";

/**
 * Competitor discovery and manual analysis against a real database, with a
 * stub search provider and no model: the queries are stored directly.
 * Needs Postgres (pnpm db:up):
 *
 *   SEO_MAKER_DB_TESTS=1 pnpm --filter @seo-maker/ai test
 */

const enabled = process.env.SEO_MAKER_DB_TESTS === "1";
const run = randomUUID().slice(0, 8);
const userId = `test_comp_${run}`;
let projectId = "";

const QUERIES: GeneratedSearchQuery[] = [
  { query: "online payment processing", intent: "commercial", priority: "high", reason: "Core service" },
  { query: "payment gateway for online stores", intent: "commercial", priority: "high", reason: "Core service" },
  { query: "subscription billing software", intent: "commercial", priority: "medium", reason: "Billing" },
  { query: "accept card payments online", intent: "transactional", priority: "high", reason: "Ready to buy" },
  { query: "invoice payment platform", intent: "commercial", priority: "medium", reason: "Invoicing" },
];

/** A search provider that answers from a table and counts its calls. */
function stubProvider(): SerpProvider & { calls: SerpRequest[] } {
  const calls: SerpRequest[] = [];
  return {
    id: "stub",
    calls,
    async search(request) {
      calls.push(request);
      const index = QUERIES.findIndex((row) => row.query === request.query);
      const items = [
        { domain: "en.wikipedia.org", url: "https://en.wikipedia.org/wiki/Payment_gateway" },
        // Recurs in every search, near the top.
        { domain: "rival-pay.com", url: `https://www.rival-pay.com/${index === 0 ? "payment-processing" : `page-${index}`}` },
        // Your own site: excluded, and recorded as your position.
        { domain: `acme-${run}.com`, url: `https://acme-${run}.com/` },
        // Appears once only.
        ...(index === 2 ? [{ domain: "oneoff.com", url: "https://oneoff.com/" }] : []),
      ];
      return {
        provider: "stub",
        items: items.map((item, position) => ({ ...item, position: position + 1, title: null, snippet: null, resultType: "organic" as const })),
      };
    },
  };
}

async function generate(id: string): Promise<GenerateQueriesResult> {
  const context = (await loadProjectSearchContext(id))!;
  const queries = await saveGeneratedQueries(context, context.searchMarket!, QUERIES);
  return { status: "ok", queries, cached: true, context };
}

beforeAll(async () => {
  if (!enabled) return;
  await prisma.account.create({ data: { userId, email: `${userId}@test.local`, plan: "pro" } });
  const project = await prisma.project.create({
    data: {
      userId,
      rootUrl: `https://acme-${run}.com`,
      siteKey: `acme-${run}.com`,
      name: `acme-${run}.com`,
      status: "analyzed",
      analysisMode: "deep",
      businessName: "Acme",
      businessType: "SaaS",
      industry: "Financial technology",
      businessDescription: "We help online businesses accept payments and manage subscriptions.",
      targetAudience: "Online retailers",
      targetLocation: "Ethiopia",
      servicesProducts: ["Payments", "Billing", "Invoicing"],
    },
  });
  projectId = project.id;
  const crawl = await prisma.crawl.create({ data: { projectId, status: "completed", phase: "done", analyzed: 1, crawled: 1, finishedAt: new Date() } });
  await prisma.page.create({
    data: {
      projectId,
      crawlId: crawl.id,
      url: `https://acme-${run}.com`,
      status: "analyzed",
      statusCode: 200,
      pageType: "homepage",
      title: "Acme | Online payments",
      h1: "Payments for online businesses",
      language: "en",
      wordCount: 500,
      discoveredVia: "seed",
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { latestCrawlId: crawl.id } });
});

afterAll(async () => {
  if (!enabled) return;
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("automatic discovery (database)", () => {
  const provider = stubProvider();

  it("searches in the project's own market, never a default", async () => {
    const search = await runDiscoverySearch({ projectId, provider, policy: COMPETITOR_POLICY, generate });
    expect(search.status).toBe("ok");
    if (search.status !== "ok") return;
    expect(provider.calls).toHaveLength(QUERIES.length);
    // Ethiopia: Google location 2231, the site's own language.
    expect(provider.calls.every((call) => call.locationCode === 2231 && call.languageCode === "en")).toBe(true);
    expect(search.strongest?.domain).toBe("rival-pay.com");
    expect(search.strongest).toMatchObject({ appearances: 5, queriesChecked: 5, top3: 5 });
    const excluded = search.aggregation.excluded.map((row) => row.domain);
    expect(excluded).toContain(`acme-${run}.com`);
    expect(excluded).toContain("wikipedia.org");
    const stored = await prisma.competitorQuery.findMany({ where: { projectId } });
    expect(stored.every((row) => row.source === "ai" && row.selfPosition === 3)).toBe(true);
  });

  it("creates the competitor once, and reuses it on the next run without crawling again", async () => {
    const first = await runDiscoverySearch({ projectId, provider, policy: COMPETITOR_POLICY, generate });
    if (first.status !== "ok" || !first.strongest) throw new Error("no candidate");
    // Searches checked within the TTL are not fetched again.
    expect(provider.calls).toHaveLength(QUERIES.length);

    const created = await resolveDiscoveredCompetitor({ projectId, candidate: first.strongest, maxCompetitors: 5, policy: COMPETITOR_POLICY });
    expect(created.decision).toBe("create");
    expect(created.competitor).toMatchObject({ domain: "rival-pay.com", source: "serp" });

    // The crawl the worker would run.
    await prisma.competitor.update({
      where: { id: created.competitor!.id },
      data: { status: "ready", pageCount: 2, lastCrawledAt: new Date(), lastAnalyzedAt: new Date() },
    });

    const second = await runDiscoverySearch({ projectId, provider, policy: COMPETITOR_POLICY, generate });
    if (second.status !== "ok" || !second.strongest) throw new Error("no candidate");
    const reused = await resolveDiscoveredCompetitor({ projectId, candidate: second.strongest, maxCompetitors: 5, policy: COMPETITOR_POLICY });
    expect(reused.decision).toBe("reuse");
    expect(reused.competitor?.id).toBe(created.competitor!.id);
    expect(await prisma.competitor.count({ where: { projectId, domain: "rival-pay.com" } })).toBe(1);
  });

  it("re-crawls only when the stored crawl is past the freshness window", async () => {
    await prisma.competitor.updateMany({ where: { projectId, domain: "rival-pay.com" }, data: { lastCrawledAt: new Date(Date.now() - 400 * 3_600_000) } });
    const search = await runDiscoverySearch({ projectId, provider, policy: COMPETITOR_POLICY, generate });
    if (search.status !== "ok" || !search.strongest) throw new Error("no candidate");
    const stale = await resolveDiscoveredCompetitor({ projectId, candidate: search.strongest, maxCompetitors: 5, policy: COMPETITOR_POLICY });
    expect(stale.decision).toBe("refresh");
    expect(await prisma.competitor.count({ where: { projectId, domain: "rival-pay.com" } })).toBe(1);
  });

  it("measures a competitor's confidence from search, business and market evidence", async () => {
    const competitor = await prisma.competitor.findFirstOrThrow({ where: { projectId, domain: "rival-pay.com" } });
    await prisma.competitorPage.createMany({
      data: [
        {
          competitorId: competitor.id,
          url: "https://rival-pay.com",
          status: "analyzed",
          statusCode: 200,
          title: "RivalPay | Online payments and billing",
          h1: "Accept payments online",
          headings: ["Subscription billing", "Invoicing for businesses"],
          schema: ["Organization"],
          pageType: "homepage",
          wordCount: 900,
          indexable: true,
          rawData: { language: "en", hreflang: [], addressCountries: [] },
        },
        {
          competitorId: competitor.id,
          url: "https://rival-pay.com/payment-processing",
          status: "analyzed",
          statusCode: 200,
          title: "Payment processing | RivalPay",
          h1: "Payment processing",
          headings: ["Card payments"],
          schema: [],
          pageType: "service",
          wordCount: 1200,
          indexable: true,
          rawData: { language: "en", hreflang: [], addressCountries: [], selection: { source: "serp", reason: 'Ranks #2 for "online payment processing"' } },
        },
      ],
    });
    const search = await getCompetitorSearchEvidence({ projectId, competitorDomain: competitor.domain, refresh: false, ttlHours: 72, depth: 20, provider: null });
    expect(search.summary).toMatchObject({ queriesChecked: 5, appearanceCount: 5, top3: 5 });

    const result = await analyzeCompetitor({ competitorId: competitor.id, search });
    expect(result.confidence.measuredSignalCount).toBe(6);
    expect(result.confidence.basis).toBe("search");
    expect(result.confidence.confidence).toBeGreaterThanOrEqual(75);
    const saved = await prisma.competitor.findUniqueOrThrow({ where: { id: competitor.id } });
    expect(saved).toMatchObject({ status: "ready", queryCount: 5, topQueryCount: 5, language: "en" });
  });
});

describe.skipIf(!enabled)("manual competitor without a search provider (database)", () => {
  it("measures business and market, and explains the missing search signals", async () => {
    // A fresh project with no stored searches at all.
    const project = await prisma.project.create({
      data: {
        userId,
        rootUrl: `https://solo-${run}.com`,
        siteKey: `solo-${run}.com`,
        name: `solo-${run}.com`,
        analysisMode: "deep",
        businessType: "SaaS",
        businessDescription: "Payments for online businesses.",
        targetLocation: "Global (mainly United States)",
        servicesProducts: ["Payments", "Billing", "Checkout"],
      },
    });
    const competitor = await prisma.competitor.create({ data: { projectId: project.id, domain: "adyen.com", source: "manual", status: "analyzing" } });
    await prisma.competitorPage.create({
      data: {
        competitorId: competitor.id,
        url: "https://adyen.com",
        status: "analyzed",
        title: "Adyen | Online payments, billing and checkout",
        h1: "Payments for ambitious businesses",
        metaDescription: "Accept payments online and in person.",
        headings: ["Checkout", "Billing"],
        schema: [],
        pageType: "homepage",
        rawData: { language: "en-US", hreflang: [], addressCountries: [] },
      },
    });

    const search = await getCompetitorSearchEvidence({ projectId: project.id, competitorDomain: "adyen.com", refresh: true, ttlHours: 72, depth: 20, provider: null });
    expect(search.summary).toBeNull();
    expect(search.unavailableReason).toMatch(/No search queries yet/);

    const result = await analyzeCompetitor({ competitorId: competitor.id, search });
    const byId = new Map(result.confidence.signals.map((signal) => [signal.id, signal]));
    expect(byId.get("businessSimilarity")?.measured).toBe(true);
    expect(byId.get("locationSimilarity")?.measured).toBe(true);
    expect(byId.get("classificationConfidence")).toMatchObject({ measured: true, score: 1 });
    expect(byId.get("queryCoverage")).toMatchObject({ measured: false });
    expect(byId.get("queryCoverage")?.reason).toMatch(/No search queries yet/);
    expect(result.confidence.measuredSignalCount).toBe(3);
    // Without search evidence the score is held to "secondary" at most.
    expect(result.confidence.confidence).toBe(60);
    expect(result.confidence.basis).toBe("business");
  });
});
