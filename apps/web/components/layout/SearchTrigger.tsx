"use client";

import { Search } from "lucide-react";
import { OPEN_SEARCH_EVENT, emit } from "@/lib/events";
import { cn } from "@/lib/utils";

/** Opens the workspace search (the same dialog as Ctrl K) from a page. */
export function SearchTrigger({ className, label = "Search sites, pages and settings" }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => emit(OPEN_SEARCH_EVENT)}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center gap-3 rounded-md bg-surface-soft px-4 text-left text-sm text-muted-foreground ring-1 ring-hairline",
        "hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <kbd className="hidden rounded bg-surface-card px-1.5 py-0.5 font-mono text-[11px] sm:inline">Ctrl K</kbd>
    </button>
  );
}
