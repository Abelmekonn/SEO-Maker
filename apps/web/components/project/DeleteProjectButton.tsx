"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { SITES_CHANGED_EVENT, emit } from "@/lib/events";
import { cn } from "@/lib/utils";

/**
 * Deletes a site, after a confirmation.
 *
 * Deletion is permanent: every crawl, page, issue, performance run, AI result
 * and competitor for the site goes with it. So the dialog says exactly that,
 * focuses Cancel by default, and makes Delete a deliberate second choice.
 * Escape, the backdrop and Cancel all back out without doing anything.
 */
export function DeleteProjectButton({
  projectId,
  siteName,
  variant = "icon",
  redirectTo = "/dashboard",
}: {
  projectId: string;
  siteName: string;
  /** "icon" for table rows, "full" for a settings danger zone. */
  variant?: "icon" | "full";
  redirectTo?: string;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setError("");
    dialogRef.current?.showModal();
  }

  function close() {
    if (!pending) dialogRef.current?.close();
  }

  async function confirm() {
    setPending(true);
    setError("");
    const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      const data = (await response?.json().catch(() => null)) as { error?: string } | null;
      setPending(false);
      setError(data?.error ?? "Could not delete the site. Try again.");
      return;
    }
    dialogRef.current?.close();
    emit(SITES_CHANGED_EVENT);
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={open}
          aria-label={`Delete ${siteName}`}
          title={`Delete ${siteName}`}
          className="flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-bad/10 hover:text-bad focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-4 font-mono text-sm text-bad ring-1 ring-bad/40 hover:bg-bad/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="size-4" aria-hidden />
          Delete this site
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(460px,calc(100vw-32px))] rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bad/15 text-bad">
              <TriangleAlert className="size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 id={titleId} className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
                Delete <span className="break-all">{siteName}</span>?
              </h2>
              <p className="text-sm leading-6 text-body">
                This permanently deletes the site and everything SEO Maker found for it:
              </p>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-surface-soft p-4 text-sm text-body ring-1 ring-hairline">
            <li>Every crawl and page</li>
            <li>Problems and scores</li>
            <li>PageSpeed results</li>
            <li>AI explanations and fixes</li>
            <li>Competitors</li>
            <li>Business context</li>
          </ul>

          <p className="text-sm leading-6 text-body">
            It cannot be undone. Queued crawls and analysis for this site are cancelled.
          </p>

          {error ? (
            <p role="alert" className="text-sm text-bad">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              autoFocus
              onClick={close}
              disabled={pending}
              className="inline-flex h-11 cursor-pointer items-center justify-center rounded-md px-4 font-mono text-sm text-ink ring-1 ring-hairline hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-bad px-4 font-mono text-sm text-white hover:bg-bad/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pending && "cursor-wait opacity-80",
              )}
            >
              {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              {pending ? "Deleting" : "Delete site"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
