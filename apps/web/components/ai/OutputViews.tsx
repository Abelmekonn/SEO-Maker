import type { ReactNode } from "react";
import type {
  ContentSuggestion,
  HeadingSuggestion,
  ImageAltSuggestion,
  InternalLinkSuggestion,
  MetaSuggestion,
  SchemaMarkupSuggestion,
  TitleSuggestion,
} from "@seo-maker/ai/schemas";
import { CopyButton } from "@/components/project/CopyButton";
import { type FeatureResult, friendlyAiError } from "@/lib/ai-results";

/**
 * How each Page AI output renders: the suggestions, their reasoning, and a
 * copy button for anything meant to be pasted into the page. Shared by the
 * page's Fixes list and the AI Workspace, so an output reads the same
 * wherever it appears.
 *
 * Every output is labelled as AI-written, carries the model's own confidence,
 * and says when a person should check it. Provider and model names are not
 * shown: they are an implementation detail, and change with routing.
 */

/** One stored feature result, or why there is none. */
export function FeatureOutput({ result }: { result: FeatureResult }) {
  if (!result.data) {
    return <p className="text-sm text-ink">{friendlyAiError(result.error)}</p>;
  }
  const data = result.data as { confidence: string; needsHumanReview: boolean; groundedIn: string[] };
  let body: ReactNode = null;
  switch (result.feature) {
    case "title":
    case "meta":
    case "heading":
      body = <Replacement data={result.data as TitleSuggestion | MetaSuggestion | HeadingSuggestion} feature={result.feature} />;
      break;
    case "content":
      body = <Content data={result.data as ContentSuggestion} />;
      break;
    case "schema":
      body = <Schema data={result.data as SchemaMarkupSuggestion} />;
      break;
    case "internal-link":
      body = <Links data={result.data as InternalLinkSuggestion} />;
      break;
    case "image-alt":
      body = <ImageAlt data={result.data as ImageAltSuggestion} />;
      break;
  }
  return (
    <div className="flex flex-col gap-3">
      {body}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span>AI-written · {data.confidence} confidence</span>
        <span title={data.groundedIn.join(", ")}>grounded in {data.groundedIn.length} sources</span>
        <span>{result.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        {data.needsHumanReview ? <span className="text-warn">check before publishing</span> : null}
      </p>
    </div>
  );
}

export function CodeBlock({ value, copyLabel = "Copy" }: { value: string; copyLabel?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-canvas p-3 ring-1 ring-hairline">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-ink">{value}</pre>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}

const TAG: Record<string, (value: string) => string> = {
  title: (value) => `<title>${value}</title>`,
  meta: (value) => `<meta name="description" content="${value.replace(/"/g, "&quot;")}" />`,
  heading: (value) => `<h1>${value}</h1>`,
};

export function Replacement({
  data,
  feature,
}: {
  data: TitleSuggestion | MetaSuggestion | HeadingSuggestion;
  feature: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
        <p className="font-mono text-[12px] text-muted-foreground">Current</p>
        <p className="break-words text-sm leading-6 text-body">
          {data.current ?? <span className="text-muted-foreground">None</span>}
        </p>
        <p className="font-mono text-[12px] text-muted-foreground">Diagnosis</p>
        <p className="text-sm leading-6 text-body">{data.diagnosis}</p>
      </div>
      <p className="font-mono text-[12px] text-muted-foreground">Suggested</p>
      <ol className="flex flex-col gap-2">
        {data.suggestions.map((suggestion, index) => (
          <li key={suggestion.value} className="flex flex-col gap-2 rounded-lg bg-canvas p-3 ring-1 ring-hairline">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 font-mono text-[12px] text-muted-foreground">{index + 1}</span>
              <p className="min-w-0 flex-1 break-words text-sm font-medium leading-6 text-ink">{suggestion.value}</p>
              <CopyButton value={TAG[feature]?.(suggestion.value) ?? suggestion.value} label="Copy tag" />
            </div>
            <p className="pl-5 text-xs leading-5 text-body">{suggestion.reasoning}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Content({ data }: { data: ContentSuggestion }) {
  return (
    <div className="flex flex-col gap-4">
      {data.missingTopics.length ? (
        <Section title="Topics to add">
          <ul className="flex flex-col gap-2">
            {data.missingTopics.map((row) => (
              <li key={row.topic} className="text-sm leading-6">
                <span className="text-ink">{row.topic}</span>
                <span className="text-body"> — {row.why}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {data.outline.length ? (
        <Section title="Suggested outline">
          <CodeBlock value={data.outline.map((row) => `## ${row.heading}\n${row.purpose}`).join("\n\n")} />
        </Section>
      ) : null}
      {data.unclearSections.length ? (
        <Section title="Unclear passages">
          <ul className="flex flex-col gap-3">
            {data.unclearSections.map((row) => (
              <li key={row.excerpt} className="flex flex-col gap-1">
                <blockquote className="border-l-2 border-hairline pl-3 text-xs leading-5 text-muted-foreground">{row.excerpt}</blockquote>
                <p className="text-sm leading-6 text-body">{row.improvement}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

export function Schema({ data }: { data: SchemaMarkupSuggestion }) {
  const markup = `<script type="application/ld+json">\n${JSON.stringify(data.jsonLd, null, 2)}\n</script>`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-6 text-body">
        <span className="font-mono text-[12px] text-ink">{data.entityType}</span> — {data.entityReasoning}
      </p>
      <CodeBlock value={markup} copyLabel="Copy JSON-LD" />
      {data.eligibleFeatures.length ? (
        <p className="text-xs leading-5 text-body">
          Makes the page eligible for: {data.eligibleFeatures.join(", ")}. Eligibility is not a guarantee.
        </p>
      ) : null}
      {data.missingRequiredProperties.length ? (
        <p className="text-xs leading-5 text-warn">
          Fill in before publishing (not in the crawl): {data.missingRequiredProperties.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export function Links({ data }: { data: InternalLinkSuggestion }) {
  return (
    <ul className="flex flex-col gap-2">
      {data.suggestions.map((row) => (
        <li key={row.targetUrl} className="flex flex-col gap-1.5 rounded-lg bg-canvas p-3 ring-1 ring-hairline">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm leading-6">
              <span className="text-ink">&ldquo;{row.anchorText}&rdquo;</span>
              <span className="text-muted-foreground"> → </span>
              <a href={row.targetUrl} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-[12px] text-body underline underline-offset-4 hover:text-ink">
                {row.targetUrl}
              </a>
            </p>
            <CopyButton value={`<a href="${row.targetUrl}">${row.anchorText}</a>`} label="Copy link" />
          </div>
          <p className="text-xs leading-5 text-body">
            <span className="text-muted-foreground">Where: </span>
            {row.placement}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">{row.reasoning}</p>
        </li>
      ))}
    </ul>
  );
}

export function ImageAlt({ data }: { data: ImageAltSuggestion }) {
  return (
    <div className="flex flex-col gap-3">
      {data.images.length ? (
        <ul className="flex flex-col gap-2">
          {data.images.map((row) => (
            <li key={row.src} className="flex items-start gap-2 rounded-lg bg-canvas p-3 ring-1 ring-hairline">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[11px] text-muted-foreground" title={row.src}>
                  {row.src}
                </p>
                <p className="text-sm leading-6 text-ink">{row.alt}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {row.basis === "image" ? "from the image itself" : `from ${row.basis.replace("-", " ")}`}
                </p>
              </div>
              <CopyButton value={`alt="${row.alt.replace(/"/g, "&quot;")}"`} label="Copy alt" />
            </li>
          ))}
        </ul>
      ) : null}
      {data.skipped.length ? (
        <p className="text-xs leading-5 text-body">
          {data.skipped.length} {data.skipped.length === 1 ? "image was" : "images were"} skipped because nothing on the
          page says what {data.skipped.length === 1 ? "it shows" : "they show"}.
        </p>
      ) : null}
      <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs leading-5 text-warn">
        {data.images.some((row) => row.basis === "image")
          ? "Some of this alt text was written by AI from the images themselves. Check each one against its image before using it."
          : "SEO Maker could not see these images, so this alt text comes from captions, nearby text or filenames. Check each one against its image before using it."}
      </p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[12px] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
