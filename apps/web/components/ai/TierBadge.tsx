import { cn } from "@/lib/utils";

/**
 * A page's priority classification, separate from what the page is.
 *
 * Priority pages carry their full content (text, headings, images,
 * structured data): what Page Intelligence and AI ground on. Standard pages
 * carry what the site inventory and the checks need. The label says so, so
 * it never reads as a quality score.
 */
export function TierBadge({ tier, className }: { tier: string | null | undefined; className?: string }) {
  if (tier !== "priority" && tier !== "standard") return null;
  const priority = tier === "priority";
  return (
    <span
      title={
        priority
          ? "Priority page: its full content was collected, so every AI output can use it."
          : "Standard page: counts and links were collected, not its text. Make it Priority for AI outputs that need the text."
      }
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11px] leading-5",
        priority ? "bg-primary/10 text-primary" : "bg-surface-card text-muted-foreground",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", priority ? "bg-primary" : "bg-muted-foreground/60")} />
      {priority ? "Priority" : "Standard"}
    </span>
  );
}
