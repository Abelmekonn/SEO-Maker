import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight, Globe, Plus, SearchX } from "lucide-react";
import { StatusBadge } from "@/components/project/StatusBadge";
import { SitesToolbar } from "@/components/sites/SitesToolbar";
import { requireUserId } from "@/lib/projects";
import { type SiteList, listSites, parseSiteQuery } from "@/lib/sites";
import { cn } from "@/lib/utils";

/**
 * Every site in the workspace: searched, filtered by date, sorted and
 * paginated on the server. A row opens the site's detail page, the same one
 * a crawl lands on.
 */

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");

  const query = parseSiteQuery(await searchParams);
  const [list, all] = await Promise.all([
    listSites(userId, query),
    // Whether the workspace has any site at all, to tell "none yet" from "none match".
    listSites(userId, { pageSize: 1 }),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="font-mono text-[12px] text-primary">Workspace</p>
          <h1 className="font-display text-[30px] leading-none tracking-[-0.8px] text-ink">Sites</h1>
          <p className="max-w-2xl text-sm leading-6 text-body">
            Every site you have added. Open one to see its latest crawl, pages and AI Workspace.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" aria-hidden />
          Add a website
        </Link>
      </header>

      {all.total === 0 ? (
        <EmptyWorkspace />
      ) : (
        <>
          <Suspense fallback={<div className="h-24 rounded-xl bg-surface-soft ring-1 ring-hairline" />}>
            <SitesToolbar />
          </Suspense>
          {list.items.length === 0 ? <NoMatches /> : <SitesTable list={list} />}
          {list.total > 0 ? <Pagination list={list} /> : null}
        </>
      )}
    </div>
  );
}

function SitesTable({ list }: { list: SiteList }) {
  return (
    <section aria-label="Sites" className="overflow-hidden rounded-xl bg-surface-soft ring-1 ring-hairline">
      <p className="border-b border-hairline px-5 py-3 font-mono text-[12px] text-muted-foreground" aria-live="polite">
        {list.total} {list.total === 1 ? "site" : "sites"}
        {list.query.q ? ` matching “${list.query.q}”` : ""}
      </p>
      <ul className="divide-y divide-hairline">
        {list.items.map((site) => (
          <li key={site.id}>
            <Link
              href={`/projects/${site.id}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[auto_minmax(0,1fr)_110px_110px_80px_auto]"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-card text-muted-foreground">
                <Globe className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{site.name}</span>
                <span className="block truncate font-mono text-[12px] text-muted-foreground">{site.host}</span>
              </span>
              <span className="hidden md:block">
                <span className="block font-mono text-[11px] text-muted-foreground">Added</span>
                <span className="block font-mono text-[12px] tabular-nums text-body">{dateFmt.format(new Date(site.createdAt))}</span>
              </span>
              <span className="hidden md:block">
                <span className="block font-mono text-[11px] text-muted-foreground">Last crawl</span>
                <span className="block font-mono text-[12px] tabular-nums text-body">
                  {site.lastCrawledAt ? dateFmt.format(new Date(site.lastCrawledAt)) : "Not yet"}
                </span>
              </span>
              <span className="hidden md:block">
                <span className="block font-mono text-[11px] text-muted-foreground">SEO</span>
                <span
                  className={cn(
                    "block font-mono text-sm tabular-nums",
                    site.seoScore == null ? "text-muted-foreground" : site.seoScore >= 90 ? "text-good" : site.seoScore >= 50 ? "text-warn" : "text-bad",
                  )}
                >
                  {site.seoScore ?? "–"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={site.status} />
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pagination({ list }: { list: SiteList }) {
  const href = (page: number) => {
    const params = new URLSearchParams();
    const { q, sort, dir, field, from, to } = list.query;
    if (q) params.set("q", q);
    if (sort !== "recent") params.set("sort", sort);
    if (dir) params.set("dir", dir);
    if (field !== "added") params.set("field", field);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/sites?${query}` : "/sites";
  };
  const first = (list.page - 1) * list.pageSize + 1;
  const last = Math.min(list.total, list.page * list.pageSize);

  return (
    <nav aria-label="Pages of sites" className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-mono text-[12px] tabular-nums text-muted-foreground">
        {first}–{last} of {list.total}
      </p>
      <div className="flex items-center gap-2">
        <PageLink href={href(list.page - 1)} disabled={list.page <= 1} label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </PageLink>
        <span className="font-mono text-[12px] tabular-nums text-body">
          Page {list.page} of {list.pageCount}
        </span>
        <PageLink href={href(list.page + 1)} disabled={list.page >= list.pageCount} label="Next page">
          Next
          <ChevronRight className="size-4" aria-hidden />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const className =
    "inline-flex h-10 items-center gap-1 rounded-md px-3 font-mono text-[12px] ring-1 ring-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "cursor-not-allowed text-muted-soft")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={cn(className, "text-ink hover:bg-surface-soft")}>
      {children}
    </Link>
  );
}

function NoMatches() {
  return (
    <section className="flex flex-col items-start gap-2 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline">
      <SearchX className="size-5 text-muted-foreground" aria-hidden />
      <h2 className="font-display text-[18px] leading-6 text-ink">No sites match</h2>
      <p className="text-sm leading-6 text-body">Try another name, widen the dates, or clear the filters.</p>
      <Link href="/sites" className="text-sm text-ink underline underline-offset-4 hover:text-primary">
        Clear filters
      </Link>
    </section>
  );
}

function EmptyWorkspace() {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl bg-surface-soft p-6 ring-1 ring-hairline sm:p-8">
      <h2 className="font-display text-[22px] leading-7 tracking-[-0.4px] text-ink">No sites yet</h2>
      <p className="max-w-lg text-sm leading-6 text-body">
        Add a website to run a Deep Analysis: a crawl, every check, performance and AI recommendations. Or try Quick
        Search to inspect a single URL in seconds.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/projects/new"
          className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 font-mono text-sm text-primary-foreground hover:bg-primary-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" aria-hidden />
          Add your first website
        </Link>
        <Link
          href="/quick-search"
          className="inline-flex h-11 items-center rounded-md px-4 font-mono text-sm text-ink ring-1 ring-hairline hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Quick Search
        </Link>
      </div>
    </section>
  );
}
