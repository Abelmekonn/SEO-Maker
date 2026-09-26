"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Makes a Standard page Priority and fetches its full content now, without
 * re-crawling the site. Its text, images and structured data then feed Page
 * Intelligence and every AI output.
 */
export function PriorityFetchButton({
  projectId,
  pageId,
  label = "Fetch full page",
  appearance = "outline",
}: {
  projectId: string;
  pageId: string;
  label?: string;
  appearance?: "outline" | "primary";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string; upgrade?: boolean } | null>(null);

  async function onClick() {
    setPending(true);
    setNote(null);
    const response = await fetch(`/api/projects/${projectId}/pages/${pageId}/priority`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; message?: string; upgrade?: boolean } | null;
    setPending(false);
    if (!response?.ok) {
      setNote({ error: true, text: data?.error ?? "Could not start the fetch. Try again.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    setNote({ error: false, text: data?.message ?? "Fetching the full page. This takes a few seconds." });
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={appearance === "primary" ? "default" : "outline"}
        className={cn("h-11", appearance === "primary" && "rounded-full px-5")}
        disabled={pending}
        onClick={onClick}
      >
        {pending ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
        {pending ? "Starting" : label}
      </Button>
      {note ? (
        <p role={note.error ? "alert" : "status"} className={cn("max-w-sm text-sm leading-6", note.error ? "text-bad" : "text-body")}>
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
