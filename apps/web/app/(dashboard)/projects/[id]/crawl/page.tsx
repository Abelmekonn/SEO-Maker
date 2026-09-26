import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { pageKeysOf } from "@seo-maker/core/crawl";
import { prisma } from "@seo-maker/db";
import { crawledPagesOf } from "@/lib/crawl-counts";
import { RecrawlPlanner } from "@/components/project/RecrawlPlanner";
import { siteCrawlAllowance } from "@/lib/crawl-access";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";
import { loadInventory, priorityLimitFor, toInventoryRows } from "@/lib/site-inventory";
import { normalizeSiteUrl, siteKeyOf } from "@/lib/site-url";

/**
 * Re-crawl Site: choose which of the site's known pages to fetch again.
 *
 * Works on the existing page inventory. Classification is kept as it is:
 * nothing is discovered or re-classified here. Finding pages added to the
 * site since is a separate action, Check for New Pages, on the overview.
 */
export default async function RecrawlPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { id } = await params;
  const project = await prisma.project.findFirst({ where: { id, userId } });
  if (!project) notFound();

  const account = await getAccountForUser(userId);
  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const [inventory, allowance, running, held] = await Promise.all([
    loadInventory(project, account.limits),
    siteCrawlAllowance(userId, project.siteKey ?? siteKeyOf(project.rootUrl), account.limits),
    prisma.crawl.findFirst({
      where: { projectId: project.id, status: { in: ["pending", "crawling", "analyzing", "cancelling"] } },
      select: { id: true },
    }),
    // The pages the results hold now, which a crawl of other pages may push
    // past the plan's page count.
    project.latestCrawlId
      ? prisma.page.findMany({
          where: { crawlId: project.latestCrawlId },
          select: { url: true, finalUrl: true, evidence: true, errorType: true },
        })
      : [],
  ]);
  const heldKeys = [...new Set(crawledPagesOf(held).flatMap(pageKeysOf))];
  const busy = Boolean(running) || project.status === "pending";
  const discovering = project.discoveryStatus === "queued" || project.discoveryStatus === "running";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <Link
        href={`/projects/${project.id}`}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-md font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Overview
      </Link>
      <header className="flex max-w-3xl flex-col gap-2">
        <p className="font-mono text-[12px] text-muted-foreground">Projects / {hostname}</p>
        <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">Re-crawl Site</h1>
        <p className="text-sm leading-6 text-body">
          Choose which of the {inventory.length} known {inventory.length === 1 ? "page" : "pages"} to fetch again. Each
          page keeps its Priority or Standard classification, and pages you do not choose keep their last results. To
          find pages added to the site since, use Check for New Pages on the overview.
        </p>
      </header>

      {busy || discovering ? (
        <p role="status" className="rounded-xl bg-surface-soft px-5 py-4 text-sm leading-6 text-body ring-1 ring-hairline">
          {busy ? "A crawl of this site is running." : "This site's pages are being discovered."} You can start a re-crawl
          when it finishes.{" "}
          <Link href={`/projects/${project.id}`} className="text-ink underline underline-offset-4 hover:text-primary">
            See its progress
          </Link>
        </p>
      ) : inventory.length === 0 ? (
        <p className="rounded-xl bg-surface-soft px-5 py-4 text-sm leading-6 text-body ring-1 ring-hairline">
          SEO Maker does not know this site&apos;s pages yet. Open the overview to discover them first.
        </p>
      ) : (
        <RecrawlPlanner
          projectId={project.id}
          rows={toInventoryRows(inventory)}
          priorityLimit={priorityLimitFor(account.limits)}
          planLabel={account.limits.label}
          maxPages={account.limits.maxPages}
          crawlsLeft={allowance.remaining}
          held={heldKeys}
          heldCount={crawledPagesOf(held).length}
        />
      )}
    </div>
  );
}
