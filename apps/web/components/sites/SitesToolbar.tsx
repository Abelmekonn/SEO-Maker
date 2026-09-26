"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, LoaderCircle, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Search, date filter and sort for the Sites list. State lives in the URL,
 * so a filtered list can be shared, reloaded and navigated back to; the
 * server does the filtering. Typing is debounced before the URL changes.
 */

const SORTS = [
  { id: "recent", label: "Recent activity" },
  { id: "added", label: "Date added" },
  { id: "crawled", label: "Last crawled" },
  { id: "name", label: "Name" },
  { id: "score", label: "SEO score" },
] as const;

const DEFAULT_DIR: Record<string, "asc" | "desc"> = { recent: "desc", added: "desc", crawled: "desc", name: "asc", score: "desc" };

export function SitesToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const searchId = useId();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const sort = params.get("sort") ?? "recent";
  const dir = (params.get("dir") as "asc" | "desc" | null) ?? DEFAULT_DIR[sort] ?? "desc";
  const field = params.get("field") ?? "added";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const filtered = Boolean(params.get("q") || from || to);

  function update(next: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    // Any change of filter or order starts again from the first page.
    if (!("page" in next)) search.delete("page");
    const query = search.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = window.setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => window.clearTimeout(timer);
    // `update` reads the current params each time; only typing should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-soft p-3 ring-1 ring-hairline sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label htmlFor={searchId} className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-mono text-[12px] text-muted-foreground">Search</span>
          <span className="flex h-11 items-center gap-2 rounded-md bg-canvas px-3 ring-1 ring-hairline focus-within:ring-2 focus-within:ring-ring">
            {pending ? (
              <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <input
              id={searchId}
              type="search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Site name or address"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground"
            />
          </span>
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[12px] text-muted-foreground">Date</span>
            <select
              value={field}
              onChange={(event) => update({ field: event.target.value === "added" ? null : event.target.value })}
              className="h-11 rounded-md bg-canvas px-3 text-sm text-ink ring-1 ring-hairline outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="added">Added</option>
              <option value="crawled">Last crawled</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[12px] text-muted-foreground">From</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => update({ from: event.target.value || null })}
              className="h-11 rounded-md bg-canvas px-3 text-sm text-ink ring-1 ring-hairline outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[12px] text-muted-foreground">To</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => update({ to: event.target.value || null })}
              className="h-11 rounded-md bg-canvas px-3 text-sm text-ink ring-1 ring-hairline outline-none [color-scheme:dark] focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[12px] text-muted-foreground">Sort by</span>
            <select
              value={sort}
              onChange={(event) => update({ sort: event.target.value === "recent" ? null : event.target.value, dir: null })}
              className="h-11 rounded-md bg-canvas px-3 text-sm text-ink ring-1 ring-hairline outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SORTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => update({ dir: dir === "asc" ? "desc" : "asc" })}
            aria-label={dir === "asc" ? "Ascending. Switch to descending" : "Descending. Switch to ascending"}
            title={dir === "asc" ? "Ascending" : "Descending"}
            className="flex size-11 cursor-pointer items-center justify-center rounded-md bg-canvas text-ink ring-1 ring-hairline hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dir === "asc" ? <ArrowUpNarrowWide className="size-4" aria-hidden /> : <ArrowDownWideNarrow className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      {filtered ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            update({ q: null, from: null, to: null, field: null });
          }}
          className={cn(
            "inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-full px-3 font-mono text-[12px] text-body ring-1 ring-hairline",
            "hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="size-3" aria-hidden />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
