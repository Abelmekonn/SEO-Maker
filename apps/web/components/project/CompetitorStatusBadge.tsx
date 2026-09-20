import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  crawling: "Crawling",
  analyzing: "Analyzing",
  ready: "Ready",
  failed: "Failed",
  skipped: "Skipped",
};

export function CompetitorStatusBadge({ status, title }: { status: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 font-mono text-[12px] leading-4",
        status === "ready" && "bg-good/15 text-good",
        (status === "crawling" || status === "analyzing") && "bg-surface-strong text-ink",
        status === "failed" && "bg-bad/15 text-bad",
        (status === "pending" || status === "queued" || status === "skipped") &&
          "bg-surface-card text-muted-foreground",
        !labels[status] && "bg-surface-card text-muted-foreground",
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
