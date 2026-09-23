import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Shared header for the AI Search sub-pages, so they read as one section. */
export function AiSearchHeader({
  projectId,
  title,
  description,
  action,
}: {
  projectId: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Link
          href={`/projects/${projectId}/ai-search`}
          className="inline-flex items-center gap-1 rounded-md font-mono text-[12px] text-muted-foreground hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-3" aria-hidden />
          AI Search
        </Link>
        <h1 className="mt-1 font-display text-[28px] leading-none tracking-[-0.5px] text-ink">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-body">{description}</p>
      </div>
      {action}
    </header>
  );
}

/**
 * The state a page is in when the thing it reports has not been produced yet.
 *
 * Always says what would appear here and what produces it, so an empty page
 * reads as "not yet" rather than "broken" — and never implies a measurement
 * that does not exist.
 */
export function NotAvailable({
  title,
  body,
  detail,
  action,
}: {
  title: string;
  body: string;
  detail?: string[];
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft px-5 py-6 ring-1 ring-hairline">
      <div>
        <p className="text-[13px] font-medium text-ink">{title}</p>
        <p className="mt-1 max-w-2xl text-[12px] leading-5 text-muted-soft">{body}</p>
      </div>
      {detail && detail.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {detail.map((line) => (
            <li key={line} className="flex gap-2 text-[12px] leading-5 text-muted-soft">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-soft" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      {action}
    </section>
  );
}
