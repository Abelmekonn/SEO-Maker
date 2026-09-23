import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/shell";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { AiRecommendations } from "@/components/project/AiRecommendations";
import { PageChecks } from "@/components/project/PageChecks";
import { PageEvidencePanel } from "@/components/project/PageEvidence";
import { RecrawlButton } from "@/components/project/RecrawlButton";
import { StatusBadge } from "@/components/project/StatusBadge";
import { aiConfigured, getPageRecommendation } from "@/lib/ai-results";
import { getPageForUser, requireUserId } from "@/lib/projects";
import { pagePath } from "@/lib/site-url";

export default async function ProjectPageDetailPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id, pageId } = await params;
  const page = await getPageForUser(id, pageId, userId);

  if (!page) {
    notFound();
  }

  const recommendation = await getPageRecommendation(page.id);
  const liveUrl = page.finalUrl ?? page.url;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8">
      <CrawlRefresh status={page.status} />
      <Link
        href={`/projects/${id}/pages`}
        className="inline-flex min-h-10 w-fit items-center gap-1.5 rounded-md font-mono text-sm text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All pages
      </Link>
      <PageHeader
        title={pagePath(liveUrl)}
        meta={
          <div className="flex flex-wrap items-center gap-3">
            <p className="break-all font-mono text-sm text-body">{liveUrl}</p>
            <StatusBadge status={page.status} />
          </div>
        }
        description={`${page.project.name}. Every check the crawler ran on this page, failing ones first.`}
        actions={
          <>
            <Button asChild variant="outline" className="h-11 w-fit">
              <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                Open live page
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
            <RecrawlButton projectId={id} maxPages={page.project.maxPages} />
          </>
        }
      />
      <PageChecks page={page} />
      <AiRecommendations
        result={recommendation}
        projectId={id}
        pageId={page.id}
        aiEnabled={aiConfigured()}
      />
      <PageEvidencePanel page={page} />
    </div>
  );
}
