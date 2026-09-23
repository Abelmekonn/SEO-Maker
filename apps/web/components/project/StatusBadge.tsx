import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  pending: "Pending",
  crawling: "Crawling",
  analyzed: "Analyzed",
  completed: "Completed",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 font-mono text-[12px] leading-4",
        (status === "analyzed" || status === "completed") && "bg-good/15 text-good",
        status === "crawling" && "bg-surface-strong text-ink",
        status === "failed" && "bg-bad/15 text-bad",
        status === "pending" && "bg-surface-card text-muted-foreground",
        !labels[status] && "bg-surface-card text-muted-foreground",
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
