"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, FileText, Globe, LoaderCircle, Search, X } from "lucide-react";
import { OPEN_SEARCH_EVENT } from "@/lib/events";
import type { SearchResult } from "@/lib/search";
import { cn } from "@/lib/utils";

/**
 * Workspace search: sites, their pages and the product's screens.
 *
 * Opens with ⌘K / Ctrl+K or the sidebar's search field. Queries the server
 * (debounced, stale requests cancelled), because pages live in the database,
 * not in the browser. Arrow keys move through results; Enter opens one.
 */

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

type Item = { key: string; href: string; label: string; detail: string; kind: "site" | "page" | "screen" };

export function SearchDialog({ projectId }: { projectId: string | null }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const open = useCallback(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    window.setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, open);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, open);
    };
  }, [open]);

  const fetchResults = useCallback(
    async (q: string, offset = 0) => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;
      const params = new URLSearchParams({ q, offset: String(offset) });
      if (projectId) params.set("project", projectId);
      const response = await fetch(`/api/search?${params}`, { signal: next.signal }).catch((reason) => {
        if ((reason as Error).name === "AbortError") return "aborted" as const;
        return null;
      });
      if (response === "aborted") return null;
      if (!response?.ok) throw new Error("search failed");
      return (await response.json()) as SearchResult;
    },
    [projectId],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      controller.current?.abort();
      setResult(null);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetchResults(q)
        .then((data) => {
          if (!data) return;
          setResult(data);
          setError(false);
          setActive(0);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [fetchResults, query]);

  async function loadMore() {
    if (!result) return;
    setLoadingMore(true);
    try {
      const more = await fetchResults(result.q, result.pages.offset + result.pages.items.length);
      if (more) {
        setResult({ ...result, pages: { ...more.pages, items: [...result.pages.items, ...more.pages.items], offset: result.pages.offset } });
      }
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const items: Item[] = useMemo(() => {
    if (!result) return [];
    return [
      ...result.sites.map((site) => ({
        key: `site:${site.id}`,
        href: `/projects/${site.id}`,
        label: site.name,
        detail: site.host,
        kind: "site" as const,
      })),
      ...result.pages.items.map((page) => ({
        key: `page:${page.id}`,
        href: `/projects/${page.projectId}/pages/${page.id}`,
        label: page.title || page.path,
        detail: `${page.siteName} · ${page.path}`,
        kind: "page" as const,
      })),
      ...result.destinations.map((destination) => ({
        key: `screen:${destination.id}`,
        href: destination.href,
        label: destination.label,
        detail: destination.description,
        kind: "screen" as const,
      })),
    ];
  }, [result]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialogRef.current?.close();
    setQuery("");
    router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(items[active]);
    }
  }

  const q = query.trim();
  const groups: Array<{ title: string; kind: Item["kind"] }> = [
    { title: "Sites", kind: "site" },
    { title: "Pages", kind: "page" },
    { title: "Go to", kind: "screen" },
  ];
  const morePages = result ? result.pages.total - result.pages.items.length : 0;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="m-auto mt-[12vh] w-[min(640px,calc(100vw-32px))] overflow-hidden rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <h2 id={titleId} className="sr-only">
        Search your workspace
      </h2>
      <div className="flex items-center gap-3 border-b border-hairline px-4">
        {loading ? (
          <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search sites, pages and settings"
          aria-label="Search sites, pages and settings"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `${listId}-${items[active].key}` : undefined}
          role="combobox"
          aria-expanded={items.length > 0}
          autoComplete="off"
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close search"
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="max-h-[min(460px,60vh)] overflow-y-auto p-2" aria-live="polite">
        {q.length < MIN_QUERY ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Type at least {MIN_QUERY} characters. Search covers your sites, the pages of their latest crawl, and
            screens like Quick Search or Site Strategy.
          </p>
        ) : error ? (
          <p role="alert" className="px-3 py-6 text-center text-sm text-bad">
            Search is not available right now. Try again in a moment.
          </p>
        ) : !result && loading ? (
          <ul className="flex flex-col gap-1 p-1" aria-label="Loading results">
            {[0, 1, 2, 3].map((row) => (
              <li key={row} className="h-12 animate-pulse rounded-lg bg-surface-soft motion-reduce:animate-none" />
            ))}
          </ul>
        ) : result && items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-body">
            Nothing matches &ldquo;{result.q}&rdquo;. Try a site name, a page path like /pricing, or a page title.
          </p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Search results" className="flex flex-col gap-3">
            {groups.map((group) => {
              const rows = items.filter((item) => item.kind === group.kind);
              if (rows.length === 0) return null;
              return (
                <li key={group.kind} role="presentation">
                  <p className="px-3 pb-1 font-mono text-[11px] text-muted-foreground">
                    {group.title}
                    {group.kind === "page" && result ? ` · ${result.pages.total}` : ""}
                  </p>
                  <ul role="presentation" className="flex flex-col">
                    {rows.map((item) => {
                      const index = items.indexOf(item);
                      const Icon = item.kind === "site" ? Globe : item.kind === "page" ? FileText : ArrowRight;
                      return (
                        <li
                          key={item.key}
                          id={`${listId}-${item.key}`}
                          role="option"
                          aria-selected={index === active}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(item)}
                          className={cn(
                            "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2",
                            index === active ? "bg-surface-card" : "hover:bg-surface-soft",
                          )}
                        >
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">{item.label}</span>
                            <span className="block truncate font-mono text-[11px] text-muted-foreground">{item.detail}</span>
                          </span>
                          {index === active ? <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                        </li>
                      );
                    })}
                  </ul>
                  {group.kind === "page" && morePages > 0 ? (
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      className="mx-3 mt-1 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 font-mono text-[12px] text-body hover:bg-surface-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
                    >
                      {loadingMore ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                      Show {Math.min(morePages, result?.pages.limit ?? 8)} more of {morePages}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
        <span>↑ ↓ to move · Enter to open · Esc to close</span>
        <span className="hidden sm:inline">Ctrl K</span>
      </footer>
    </dialog>
  );
}
