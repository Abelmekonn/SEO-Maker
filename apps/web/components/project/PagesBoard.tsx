import type { Page } from "@seo-maker/db";
import { PageAuditTable } from "@/components/project/PageAuditTable";
import { PagesAnalytics } from "@/components/project/PagesAnalytics";

export function PagesBoard({
  pages,
  projectId,
  maxPages = 1,
  planLabel = "Free",
}: {
  pages: Page[];
  projectId: string;
  maxPages?: number;
  planLabel?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PagesAnalytics pages={pages} maxPages={maxPages} planLabel={planLabel} />
      <section aria-label="Page list" className="flex min-h-0 flex-1 flex-col">
        <PageAuditTable pages={pages} projectId={projectId} />
      </section>
    </div>
  );
}
