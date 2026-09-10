import Link from "next/link";
import { ChevronRight, CircleAlert, LoaderCircle } from "lucide-react";
import type { Page } from "@seo-maker/db";
import { StatusBadge } from "@/components/project/StatusBadge";
import { failedChecks, isCrawled, THIN_WORD_LIMIT } from "@/lib/page-audit";
import { pagePath } from "@/lib/site-url";
import { cn } from "@/lib/utils";

function Dash() {
  return <span className="text-muted-foreground">-</span>;
}

function LoadingValue({ label = "Crawling" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      <span className="font-mono text-[12px]">{label}</span>
    </span>
  );
}

function isLoading(page: Page) {
  return page.status === "pending" || page.status === "crawling";
}

function FieldCell({
  page,
  value,
  missingLabel,
}: {
  page: Page;
  value: string | null | undefined;
  missingLabel: string;
}) {
  if (!isCrawled(page)) {
    return isLoading(page) ? <LoadingValue /> : <Dash />;
  }

  if (!value?.trim()) {
    return (
      <span className="inline-flex items-center gap-1.5 text-warn">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden />
        {missingLabel}
      </span>
    );
  }

  return (
    <span className="block truncate text-body" title={value}>
      {value}
    </span>
  );
}

function StatusCodeCell({ page }: { page: Page }) {
  if (!isCrawled(page) || page.statusCode == null) {
    return isLoading(page) ? <LoadingValue label="Checking" /> : <Dash />;
  }
  return (
    <span
      className={cn("font-mono tabular-nums", page.statusCode >= 400 ? "text-warn" : "text-body")}
    >
      {page.statusCode}
    </span>
  );
}

function WordsCell({ page }: { page: Page }) {
  if (!isCrawled(page) || page.wordCount == null) {
    return isLoading(page) ? <LoadingValue label="Parsing" /> : <Dash />;
  }

  const thin = page.wordCount < THIN_WORD_LIMIT;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-end gap-2 font-mono tabular-nums",
        thin ? "text-warn" : "text-body",
      )}
    >
      {page.wordCount.toLocaleString()}
      {thin ? <span className="text-[12px]">thin</span> : null}
    </span>
  );
}

function IssuesCell({ page }: { page: Page }) {
  if (!isCrawled(page)) {
    return isLoading(page) ? <LoadingValue label="Scanning" /> : <Dash />;
  }

  const failed = failedChecks(page);
  if (failed.length === 0) {
    return <span className="text-good">None</span>;
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 text-warn"
      title={failed.map((check) => check.label).join(", ")}
    >
      <CircleAlert className="size-3.5 shrink-0" aria-hidden />
      {failed.length} {failed.length === 1 ? "issue" : "issues"}
    </span>
  );
}

export function PageAuditTable({
  pages,
  projectId,
}: {
  pages: Page[];
  projectId?: string;
}) {
  if (pages.length === 0) {
    return (
      <div className="rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
        <p className="text-sm leading-6 text-body">
          No pages yet. Run a homepage crawl to fill this table.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-surface-soft ring-1 ring-hairline">
      <table className="w-full min-w-[960px] border-collapse text-sm">
        <caption className="sr-only">Audit results per page</caption>
        <thead className="sticky top-0 z-10 bg-surface-card">
          <tr className="text-left font-mono text-[12px] text-muted-foreground">
            <th scope="col" className="px-5 py-3.5 font-medium">
              URL
            </th>
            <th scope="col" className="px-5 py-3.5 font-medium">
              Code
            </th>
            <th scope="col" className="px-5 py-3.5 font-medium">
              Title
            </th>
            <th scope="col" className="px-5 py-3.5 font-medium">
              Meta description
            </th>
            <th scope="col" className="px-5 py-3.5 font-medium">
              H1
            </th>
            <th scope="col" className="px-5 py-3.5 text-right font-medium">
              Words
            </th>
            <th scope="col" className="px-5 py-3.5 font-medium">
              Issues
            </th>
            <th scope="col" className="px-5 py-3.5 font-medium">
              Status
            </th>
            {projectId ? (
              <th scope="col" className="w-12 px-3 py-3.5">
                <span className="sr-only">Details</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr
              key={page.id}
              className={cn(
                "border-t border-hairline hover:bg-surface-card/60 transition-colors",
                isLoading(page) && "bg-surface-card/30",
              )}
            >
              <td className="px-5 py-4 font-mono text-ink">
                {projectId ? (
                  <Link
                    href={`/projects/${projectId}/pages/${page.id}`}
                    className="inline-flex min-h-6 items-center underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {pagePath(page.finalUrl ?? page.url)}
                  </Link>
                ) : (
                  pagePath(page.finalUrl ?? page.url)
                )}
              </td>
              <td className="px-5 py-4">
                <StatusCodeCell page={page} />
              </td>
              <td className="max-w-[260px] px-5 py-4">
                <FieldCell page={page} value={page.title} missingLabel="Missing title" />
              </td>
              <td className="max-w-[320px] px-5 py-4">
                <FieldCell page={page} value={page.metaDesc} missingLabel="Missing meta" />
              </td>
              <td className="max-w-[220px] px-5 py-4">
                <FieldCell page={page} value={page.h1} missingLabel="Missing H1" />
              </td>
              <td className="px-5 py-4 text-right">
                <WordsCell page={page} />
              </td>
              <td className="px-5 py-4">
                <IssuesCell page={page} />
              </td>
              <td className="px-5 py-4">
                <StatusBadge status={page.status} />
              </td>
              {projectId ? (
                <td className="px-3 py-4">
                  <Link
                    href={`/projects/${projectId}/pages/${page.id}`}
                    aria-label={`Open details for ${pagePath(page.finalUrl ?? page.url)}`}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
