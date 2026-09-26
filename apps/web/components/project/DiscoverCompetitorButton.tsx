"use client";

import type { ProfileGap } from "@seo-maker/core/competitors";
import { LoaderCircle, Radar } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BusinessProfileDialog } from "@/components/project/BusinessProfileDialog";
import { Button } from "@/components/ui/button";
import type { BusinessContext } from "@/lib/business-context";
import { AI_USAGE_EVENT, COMPETITOR_QUEUED_EVENT, emit } from "@/lib/events";

/**
 * "Discover Competitor": finds the one strongest competitor in your
 * searches. Without a complete business profile it asks for one first,
 * rather than searching for a business it does not understand.
 */
export function DiscoverCompetitorButton({
  projectId,
  context,
  missing,
  disabledReason,
  running,
}: {
  projectId: string;
  context: BusinessContext;
  /** What the profile lacks, known on the server. */
  missing: ProfileGap[];
  disabledReason?: string;
  running: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ text: string; upgrade: boolean } | null>(null);
  const [gaps, setGaps] = useState<ProfileGap[]>(missing);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function start() {
    setPending(true);
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/competitors/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID() }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      error?: string;
      code?: string;
      missing?: ProfileGap[];
      upgrade?: boolean;
    } | null;
    setPending(false);
    if (response?.status === 422 && data?.code === "profile-required") {
      setGaps(data.missing ?? []);
      setDialogOpen(true);
      return;
    }
    if (!response?.ok) {
      setError({ text: data?.error ?? "Could not start discovery. Try again.", upgrade: Boolean(data?.upgrade) });
      return;
    }
    setDialogOpen(false);
    emit(COMPETITOR_QUEUED_EVENT);
    emit(AI_USAGE_EVENT);
    router.refresh();
  }

  function onClick() {
    if (gaps.length > 0) {
      setDialogOpen(true);
      return;
    }
    void start();
  }

  const busy = pending || running;
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        className="h-11 w-fit rounded-full px-5"
        onClick={onClick}
        disabled={busy || Boolean(disabledReason)}
        title={disabledReason}
        aria-busy={busy}
      >
        {busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Radar className="size-4" aria-hidden />}
        {running ? "Discovering" : pending ? "Starting" : "Discover Competitor"}
      </Button>
      {disabledReason ? <p className="max-w-xs text-right text-xs leading-5 text-muted-foreground">{disabledReason}</p> : null}
      {error ? (
        <p role="alert" className="max-w-xs text-right text-sm text-bad">
          {error.text}
          {error.upgrade ? (
            <>
              {" "}
              <Link href="/pricing" className="text-ink underline underline-offset-4 hover:text-primary">
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <BusinessProfileDialog
        projectId={projectId}
        initial={context}
        missing={gaps}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          setGaps([]);
          await start();
        }}
        submitLabel="Save & Discover"
        intro="To find relevant competitors, SEO Maker needs to understand your business: what you sell, who buys it, and in which market they search."
      />
    </div>
  );
}
