"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * "Crawl Page": fetches this one page again and re-runs its checks, after
 * the user changed it. Nothing else on the site is crawled, discovered or
 * re-classified.
 */
export function CrawlPageButton({
  projectId,
  pageId,
  busy = false,
}: {
  projectId: string;
  pageId: string;
  /** The page is queued or being fetched. */
  busy?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string; upgrade?: boolean } | null>(null);

  async function onClick() {
    setPending(true);
    setNote(null);
    const response = await fetch(`/api/projects/${projectId}/pages/${pageId}/crawl`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; message?: string; upgrade?: boolean } | null;
    setPending(false);
    if (!response?.ok) {
      setNote({ error: true, text: data?.error ?? "Could not crawl this page. Try again.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    setNote({ error: false, text: data?.message ?? "Crawling this page. Its checks update here when it is done." });
    router.refresh();
  }

  const working = pending || busy;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" className="h-11 w-fit rounded-full px-5" disabled={working} onClick={onClick} aria-busy={working}>
        {working ? (
          <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <RefreshCw className="size-3.5" aria-hidden />
        )}
        {pending ? "Starting" : busy ? "Crawling page" : "Crawl Page"}
      </Button>
      {note ? (
        <p role={note.error ? "alert" : "status"} className={note.error ? "max-w-xs text-sm leading-6 text-bad" : "max-w-xs text-sm leading-6 text-body"}>
          {note.text}
          {note.upgrade ? (
            <>
              {" "}
              <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
