import { prisma } from "@seo-maker/db";
import { crawlHomepageHtml } from "../lib/crawler";

export type CrawlHomepageJob = {
  projectId: string;
  pageId: string;
  url: string;
};

export async function crawlHomepageJob(data: CrawlHomepageJob) {
  const { projectId, pageId, url } = data;

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "crawling" },
  });
  await prisma.page.update({
    where: { id: pageId },
    data: { status: "crawling" },
  });

  try {
    const audit = await crawlHomepageHtml(url);

    await prisma.page.update({
      where: { id: pageId },
      data: {
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
        status: "analyzed",
      },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "analyzed" },
    });
  } catch (error) {
    await prisma.page.update({
      where: { id: pageId },
      data: { status: "failed" },
    });
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "failed" },
    });
    throw error;
  }
}
