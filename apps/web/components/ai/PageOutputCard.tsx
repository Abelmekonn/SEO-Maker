import type { ReactNode } from "react";
import { CircleAlert, FileSearch, LoaderCircle } from "lucide-react";
import type { OutputAvailability, PageAiOutput } from "@seo-maker/core/page";
import { AiRunButton } from "@/components/ai/AiRunButton";
import { FeatureOutput } from "@/components/ai/OutputViews";
import type { FeatureResult } from "@/lib/ai-results";
import { cn } from "@/lib/utils";

/**
 * One Page AI output (metadata, content, headings, structured data, alt text,
 * internal links): what it is, whether this page has the evidence for it,
 * the button that asks for it, and what AI has written so far.
 */

export const OUTPUT_COPY: Record<PageAiOutput, { title: string; body: string }> = {
  analysis: {
    title: "Page analysis",
    body: "Every failing check on this page, why it matters, and what to do about it.",
  },
  metadata: {
    title: "Metadata",
    body: "A title and meta description, written from the page's own heading and text.",
  },
  content: {
    title: "Content",
    body: "Topics a visitor would expect and the page misses, an outline if it lacks structure, and unclear passages.",
  },
  headings: {
    title: "Headings",
    body: "A clear top-level heading that says what the page is about.",
  },
  schema: {
    title: "Structured data",
    body: "JSON-LD for the page's type, using only values the page shows.",
  },
  "alt-text": {
    title: "Image alt text",
    body: "Alt text for images without it, written from the image itself where possible.",
  },
  "internal-links": {
    title: "Internal links",
    body: "Links from this page to related pages of your site, using only pages the crawl found.",
  },
};

export function PageOutputCard({
  output,
  endpoint,
  pageId,
  availability,
  results,
  queued,
  blockedReason,
  remedy,
}: {
  output: PageAiOutput;
  endpoint: string;
  pageId: string;
  availability: OutputAvailability;
  /** The latest result of each feature behind this output. */
  results: FeatureResult[];
  /** A job for this output is waiting or running. */
  queued: boolean;
  /** The plan, the homepage rule or configuration stops AI here. */
  blockedReason?: string;
  /** What the user can do to make an unavailable output possible. */
  remedy?: ReactNode;
}) {
  const copy = OUTPUT_COPY[output];
  const hasResult = results.some((result) => result.data);
  const failed = results.filter((result) => !result.data);

  return (
    <section
      aria-labelledby={`output-${output}`}
      className={cn("flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline", !availability.available && !hasResult && "bg-surface-soft/60")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 max-w-xl flex-col gap-1">
          <h3 id={`output-${output}`} className="font-display text-[17px] leading-6 tracking-[-0.2px] text-ink">
            {copy.title}
          </h3>
          <p className="text-sm leading-6 text-body">{copy.body}</p>
        </div>
        {queued ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-card px-3 font-mono text-[12px] text-ink" role="status">
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Writing
          </span>
        ) : availability.available ? (
          <AiRunButton
            endpoint={endpoint}
            body={{ pageId, outputs: [output] }}
            label={hasResult ? "Regenerate" : "Generate"}
            regenerate={hasResult}
            size="compact"
            disabledReason={blockedReason}
          />
        ) : null}
      </div>

      {!availability.available ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 rounded-lg bg-surface-card px-3 py-2.5 text-sm leading-6 text-body">
            <FileSearch className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            {availability.reason}
          </p>
          {remedy}
        </div>
      ) : null}

      {results
        .filter((result) => result.data)
        .map((result) => (
          <div key={result.id} className="border-t border-hairline pt-4">
            {results.length > 1 ? (
              <p className="mb-2 font-mono text-[12px] text-muted-foreground">
                {result.feature === "title" ? "Title" : result.feature === "meta" ? "Meta description" : result.feature}
              </p>
            ) : null}
            <FeatureOutput result={result} />
          </div>
        ))}

      {failed.length && !queued ? (
        <div className="flex items-start gap-2 text-sm text-bad">
          <CircleAlert className="mt-1 size-3.5 shrink-0" aria-hidden />
          <FeatureOutput result={failed[0]} />
        </div>
      ) : null}
    </section>
  );
}
