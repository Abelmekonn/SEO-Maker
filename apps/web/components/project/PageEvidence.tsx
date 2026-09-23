import type { Page } from "@seo-maker/db";
import type { PageEvidence as Evidence } from "@seo-maker/core/page";
import { cn } from "@/lib/utils";

/**
 * What the crawler actually captured from the page (Phase 0.2).
 *
 * The crawl stores heading text, anchored links, image metadata and parsed
 * JSON-LD, and until now none of it reached the UI — the page showed counts
 * derived from evidence the user could not see. This panel shows the evidence
 * itself, which is also exactly what the AI layer is given, so a user can check
 * a recommendation against the same facts the model had.
 */

const MAX_VISIBLE = 12;

export function PageEvidencePanel({ page }: { page: Page }) {
  const evidence = (page.evidence ?? null) as Evidence | null;

  if (!evidence) {
    return null;
  }

  const headings = evidence.headings ?? [];
  const links = evidence.links ?? [];
  const images = evidence.images ?? [];
  const schema = evidence.schema ?? [];

  const internal = links.filter((link) => link.internal);
  const external = links.filter((link) => !link.internal);
  const missingAlt = images.filter((image) => !image.decorative && !image.alt?.trim());
  const describable = missingAlt.filter((image) => image.context.trim() || image.filename);

  const nothing =
    headings.length === 0 && links.length === 0 && images.length === 0 && schema.length === 0;
  if (nothing) {
    return null;
  }

  return (
    <section aria-label="Crawl evidence" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] leading-tight tracking-[-0.4px] text-ink">
          Evidence
        </h2>
        <p className="text-sm leading-6 text-body">
          What the crawler read from this page. Recommendations are grounded in these facts.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {headings.length > 0 ? (
          <Panel title="Headings" count={headings.length}>
            <ul className="flex flex-col gap-1.5">
              {headings.slice(0, MAX_VISIBLE).map((heading, index) => (
                <li key={`${heading.level}-${index}`} className="flex gap-2.5">
                  <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground">
                    H{heading.level}
                  </span>
                  <span className="min-w-0 break-words text-sm leading-6 text-body">
                    {heading.text}
                  </span>
                </li>
              ))}
            </ul>
            <More total={headings.length} shown={MAX_VISIBLE} noun="heading" />
          </Panel>
        ) : null}

        {schema.length > 0 ? (
          <Panel title="Structured data" count={schema.length}>
            <ul className="flex flex-col gap-2">
              {schema.map((block, index) => (
                <li key={index} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-ink">
                      {block.types.length ? block.types.join(", ") : "Untyped block"}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[11px] leading-5",
                        block.valid ? "bg-good/15 text-good" : "bg-bad/15 text-bad",
                      )}
                    >
                      {block.valid ? "Parsed" : "Invalid"}
                    </span>
                  </div>
                  {block.error ? (
                    <p className="break-words text-xs leading-5 text-bad">{block.error}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Valid markup makes a page eligible for richer search results. It does not guarantee
              one.
            </p>
          </Panel>
        ) : null}

        {links.length > 0 ? (
          <Panel title="Links" count={links.length}>
            <p className="mb-3 font-mono text-[12px] text-muted-foreground">
              {internal.length} internal · {external.length} external
            </p>
            <ul className="flex flex-col gap-2">
              {internal.slice(0, MAX_VISIBLE).map((link, index) => (
                <li key={`${link.href}-${index}`} className="flex flex-col gap-0.5">
                  <span className="break-words text-sm leading-6 text-body">
                    {link.anchor || (
                      <span className="text-warn">No anchor text (image or empty link)</span>
                    )}
                  </span>
                  <span className="break-all font-mono text-[11px] text-muted-foreground">
                    {link.href}
                  </span>
                </li>
              ))}
            </ul>
            <More total={internal.length} shown={MAX_VISIBLE} noun="internal link" />
          </Panel>
        ) : null}

        {images.length > 0 ? (
          <Panel title="Images" count={images.length}>
            <p className="mb-3 font-mono text-[12px] text-muted-foreground">
              {missingAlt.length} missing alt · {images.filter((i) => i.decorative).length}{" "}
              decorative
            </p>
            {missingAlt.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {missingAlt.slice(0, MAX_VISIBLE).map((image, index) => (
                  <li key={`${image.src}-${index}`} className="flex flex-col gap-0.5">
                    <span className="break-all font-mono text-[11px] text-muted-foreground">
                      {image.filename ?? image.src}
                    </span>
                    {image.context ? (
                      <span className="break-words text-xs leading-5 text-body">
                        Near: {image.context}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-6 text-body">Every meaningful image has alt text.</p>
            )}
            {missingAlt.length > 0 && describable.length < missingAlt.length ? (
              // Phase 0.3: alt text is never generated from a count. Images with
              // no surrounding context carry nothing to describe them with.
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {missingAlt.length - describable.length} of these have no surrounding text, so alt
                text cannot be suggested automatically. They need a human to describe them.
              </p>
            ) : null}
            <More total={missingAlt.length} shown={MAX_VISIBLE} noun="image" />
          </Panel>
        ) : null}
      </div>
    </section>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg bg-surface-soft p-6 ring-1 ring-hairline">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-ink">{title}</h3>
        <span className="font-mono text-[12px] text-muted-foreground tabular-nums">{count}</span>
      </div>
      {children}
    </div>
  );
}

function More({ total, shown, noun }: { total: number; shown: number; noun: string }) {
  if (total <= shown) {
    return null;
  }
  const rest = total - shown;
  return (
    <p className="mt-3 font-mono text-[11px] text-muted-foreground">
      + {rest} more {noun}
      {rest === 1 ? "" : "s"}
    </p>
  );
}
