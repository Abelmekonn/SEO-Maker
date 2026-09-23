"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { CRAWL_QUEUED_EVENT } from "@/components/project/CrawlMiniStatus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RecrawlButton({
  projectId,
  maxPages = 1,
  appearance = "outline",
}: {
  projectId: string;
  maxPages?: number;
  appearance?: "outline" | "primary";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}/crawl`, {
      method: "POST",
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(data?.error ?? "Could not start the crawl.");
      return;
    }
    // The overview re-renders as the progress view; every other screen's
    // mini status starts tracking the crawl straight away.
    window.dispatchEvent(new Event(CRAWL_QUEUED_EVENT));
    router.refresh();
  }

  const label = pending ? "Queuing" : maxPages > 1 ? "Crawl site" : "Run homepage crawl";

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={appearance === "primary" ? "default" : "outline"}
        className={cn("h-11 w-fit", appearance === "primary" && "rounded-full px-5")}
        disabled={pending}
        onClick={onClick}
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Play className="size-3.5 fill-current" aria-hidden />
        )}
        {label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
