import { prisma } from "@seo-maker/db";
import { crawlSite, normalizePageUrl, type PageAudit } from "../lib/crawler";

export type CrawlHomepageJob = {
  projectId: string;
  pageId: string;
  url: string;
};

export async function crawlHomepageJob(data: CrawlHomepageJob) {
  const { projectId, url } = data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { pages: true },
  });

  if (!project) {
    throw new Error(`Project ${projectId} was not found.`);
  }

  const maxPages = Math.max(1, project.maxPages ?? 1);
  const saved = new Set<string>();

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "crawling" },
  });
  await prisma.page.updateMany({
    where: { projectId },
    data: { status: "crawling" },
  });

  try {
    const pages = await crawlSite(url, maxPages, {
      onPage: async (audit) => {
        await savePage(projectId, audit);
        saved.add(audit.url);
        console.log(`Crawl page ${saved.size}/${maxPages}: ${audit.url}`);
      },
    });

    if (saved.size === 0) {
      for (const audit of pages) {
        await savePage(projectId, audit);
        saved.add(audit.url);
      }
    }

    if (saved.size > 0) {
      await prisma.page.deleteMany({
        where: { projectId, url: { notIn: [...saved] } },
      });
    }

    const failed = await prisma.page.count({
      where: { projectId, status: "failed" },
    });
    const analyzed = await prisma.page.count({
      where: { projectId, status: "analyzed" },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { status: analyzed === 0 && failed > 0 ? "failed" : "analyzed" },
    });
  } catch (error) {
    await prisma.page.updateMany({
      where: { projectId, status: "crawling" },
      data: { status: "failed" },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });
    throw error;
  }
}

async function savePage(projectId: string, audit: PageAudit) {
  const url = normalizePageUrl(audit.url) ?? audit.url;
  const existing = await prisma.page.findFirst({
    where: { projectId, OR: [{ url }, { url: audit.url }, { finalUrl: url }] },
  });

  const data = {
    url,
    finalUrl: audit.finalUrl,
    isHttps: audit.isHttps,
    statusCode: audit.statusCode,
    title: audit.title,
    metaDesc: audit.metaDesc,
    h1: audit.h1,
    h2Count: audit.h2Count,
    canonicalUrl: audit.canonicalUrl,
    wordCount: audit.wordCount,
    imageCount: audit.imageCount,
    missingAlt: audit.missingAlt,
    internalLinks: audit.internalLinks,
    schemaCount: audit.schemaCount,
    robotsTxtUrl: audit.robotsTxtUrl,
    robotsOk: audit.robotsOk,
    sitemapUrl: audit.sitemapUrl,
    hasSitemap: audit.hasSitemap,
    xRobotsTag: audit.xRobotsTag,
    indexable: audit.indexable,
    status: "analyzed" as const,
  };

  if (existing) {
    await prisma.page.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.page.create({
    data: { projectId, ...data },
  });
}
