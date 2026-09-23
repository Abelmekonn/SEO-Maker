import type { ReactNode } from "react";
import { CrawlMiniStatus } from "@/components/project/CrawlMiniStatus";

/**
 * Wraps every project screen. The only thing it adds is the crawl mini status,
 * so a crawl started anywhere stays visible everywhere while you keep working.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <CrawlMiniStatus projectId={id} />
      {children}
    </>
  );
}
