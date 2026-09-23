"use client";

import { useId, useRef, useState } from "react";
import { CircleStop, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Stops a crawl, a PageSpeed run or AI analysis, after a confirmation.
 *
 * Work runs on the worker, so stopping is a request: the endpoint either takes
 * a queued job off the queue ("stopped") or marks running work, which the
 * worker notices within a couple of seconds ("stopping"). While that happens
 * the button reads "Stopping" and cannot be pressed twice.
 *
 * The dialog says what is kept and what is dropped, focuses "Keep running" by
 * default, and backs out on Escape or the backdrop, like the delete dialog.
 */
export function StopWorkButton({
  endpoint,
  noun,
  title,
  children,
  stopping = false,
  size = "default",
  onStopped,
}: {
  /** DELETE on this URL stops the work. */
  endpoint: string;
  /** What is being stopped, in the button: "crawl", "PageSpeed", "analysis". */
  noun: string;
  title: string;
  /** What stopping keeps and drops. */
  children: React.ReactNode;
  /** The server already has a stop in progress. */
  stopping?: boolean;
  size?: "default" | "compact";
  onStopped?: (state: "stopping" | "stopped") => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pending, setPending] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState("");

  const busy = stopping || requested;

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
    const response = await fetch(endpoint, { method: "DELETE" }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string; state?: string } | null;
    setPending(false);
    if (!response?.ok) {
      setError(data?.error ?? "Could not stop it. Try again.");
      return;
    }
    dialogRef.current?.close();
    setRequested(true);
    // The pollers pick up the stopped state; the button stays "Stopping"
    // until they re-render this component away.
    window.setTimeout(() => setRequested(false), 20000);
    onStopped?.(data?.state === "stopped" ? "stopped" : "stopping");
  }

  const compact = size === "compact";

  return (
    <>
      {busy ? (
        <span
          role="status"
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md font-mono text-muted-foreground ring-1 ring-hairline",
            compact ? "h-8 px-2.5 text-[12px]" : "h-11 px-4 text-sm",
          )}
        >
          <Loader2 className={cn("animate-spin motion-reduce:animate-none", compact ? "size-3" : "size-3.5")} aria-hidden />
          Stopping
        </span>
      ) : (
        <button
          type="button"
          onClick={open}
          className={cn(
            "inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md font-mono text-ink ring-1 ring-hairline hover:bg-bad/10 hover:text-bad hover:ring-bad/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "h-8 px-2.5 text-[12px]" : "h-11 px-4 text-sm",
          )}
        >
          <CircleStop className={compact ? "size-3.5" : "size-4"} aria-hidden />
          Stop {noun}
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
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl bg-canvas p-0 text-ink ring-1 ring-hairline backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warn/15 text-warn">
              <CircleStop className="size-5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <h2 id={titleId} className="font-display text-[20px] leading-6 tracking-[-0.3px] text-ink">
                {title}
              </h2>
              <div className="text-sm leading-6 text-body">{children}</div>
            </div>
          </div>

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
              Keep running
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
              {pending ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <CircleStop className="size-4" aria-hidden />
              )}
              {pending ? "Stopping" : `Stop ${noun}`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
