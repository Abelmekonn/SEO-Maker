import { PageAuditTable } from "@/components/project/PageAuditTable";
import { PagesAnalytics } from "@/components/project/PagesAnalytics";
import type { InventoryRow, TieredPage } from "@/lib/site-inventory";

export function PagesBoard({
  pages,
  uncrawled,
  projectId,
  planLabel,
  maxPages,
}: {
  /** The latest crawl's pages, with their classification. */
  pages: TieredPage[];
  /** Inventory pages no crawl has fetched yet: listed, never counted as crawled. */
  uncrawled: InventoryRow[];
  projectId: string;
  planLabel: string;
  maxPages: number;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PagesAnalytics pages={pages} planLabel={planLabel} maxPages={maxPages} />
      <section aria-label="Page list" className="flex min-h-0 flex-1 flex-col">
        <PageAuditTable pages={pages} uncrawled={uncrawled} projectId={projectId} />
      </section>
    </div>
  );
}
