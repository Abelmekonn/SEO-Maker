import { notFound, redirect } from "next/navigation";
import { Globe } from "lucide-react";
import { PagesBoard } from "@/components/project/PagesBoard";
import { RecrawlButton } from "@/components/project/RecrawlButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import { getAccountForUser } from "@/lib/plan";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { loadInventory, uncrawledPages, withTiers } from "@/lib/site-inventory";
import { normalizeSiteUrl } from "@/lib/site-url";

export default async function ProjectPagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);

  if (!project) {
    notFound();
  }

  const account = await getAccountForUser(userId);
  const maxPages = account.limits.maxPages;
  // Crawled pages are counted as crawled; the inventory adds the pages
  // discovered and not crawled, which the list shows for choosing.
  const inventory = await loadInventory(project, account.limits);
  const pages = withTiers(project.pages, inventory);
  const uncrawled = uncrawledPages(inventory, project.pages);
  const parsed = normalizeSiteUrl(project.rootUrl);
  const hostname = "hostname" in parsed ? parsed.hostname : project.name;
  const lastCrawlAt = project.pages.reduce<Date | null>((latest, page) => {
    return !latest || page.createdAt > latest ? page.createdAt : latest;
  }, null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-soft text-body ring-1 ring-hairline">
            <Globe className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
              Pages
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm text-body">{hostname}</p>
              <StatusBadge status={project.status} />
              <span className="inline-flex rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] leading-4 text-ink">
                {account.limits.label}
              </span>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-body">
              {account.limits.analyzeStandardPages
                ? `Every page SEO Maker knows on this site, and every check on the ones crawled. Priority pages carry their full content; Standard pages carry what the checks need. ${account.limits.label} crawls up to ${maxPages} pages at a time.`
                : maxPages === 1
                  ? `${account.limits.label} analyzes your homepage in full: every check, with its evidence.`
                  : `Every check on up to ${account.limits.priorityPages} Priority pages. The rest of the crawl maps your site without being analyzed.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col items-end gap-0.5 text-right">
            <p className="font-mono text-[12px] text-muted-foreground">Last crawl</p>
            <p className="font-mono text-[12px] tabular-nums text-ink">
              {lastCrawlAt ? formatLastCrawl(lastCrawlAt) : "No crawl yet"}
            </p>
          </div>
          <RecrawlButton projectId={project.id} appearance="primary" />
        </div>
      </header>
      <PagesBoard
        pages={pages}
        uncrawled={uncrawled}
        projectId={project.id}
        planLabel={account.limits.label}
        maxPages={maxPages}
      />
    </div>
  );
}

function formatLastCrawl(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
