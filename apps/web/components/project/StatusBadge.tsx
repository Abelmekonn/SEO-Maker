import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  discovering: "Finding pages",
  discovered: "Ready to crawl",
  pending: "Pending",
  crawling: "Crawling",
  analyzed: "Analyzed",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Stopped",
  excluded: "Not analyzed",
  "not-crawled": "Not crawled",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 font-mono text-[12px] leading-4",
        (status === "analyzed" || status === "completed") && "bg-good/15 text-good",
        (status === "crawling" || status === "discovering") && "bg-surface-strong text-ink",
        status === "discovered" && "bg-primary/10 text-primary",
        status === "failed" && "bg-bad/15 text-bad",
        status === "pending" && "bg-surface-card text-muted-foreground",
        !labels[status] && "bg-surface-card text-muted-foreground",
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
