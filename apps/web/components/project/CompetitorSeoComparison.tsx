import { SEO_DIMENSION_LABELS, type SeoDimensionId } from "@seo-maker/core/scoring";

export type ComparisonColumn = {
  id: string;
  label: string;
  isSelf: boolean;
  dimensions: Partial<Record<SeoDimensionId, number | null>>;
};

/** The dashboard's existing chart palette, as used by the performance trend. */
const SERIES_COLORS = ["#2dd4bf", "#8b7cf6", "#3ecf8e", "#f2b84b"];

/**
 * Side-by-side SEO dimensions. Every value is a real measurement or an explicit
 * "not measured" — a competitor we never ran PageSpeed against shows a gap, not
 * a zero-length bar that would read as a score of nought.
 */
export function CompetitorSeoComparison({ columns }: { columns: ComparisonColumn[] }) {
  if (columns.length < 2) return null;

  const dimensions = Object.keys(SEO_DIMENSION_LABELS) as SeoDimensionId[];

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
      <div>
        <h2 className="font-display text-[18px] leading-6 tracking-[-0.3px] text-ink">
          SEO comparison
        </h2>
        <p className="mt-1 text-sm text-body">
          How you stack up against your tracked competitors across each scored dimension.
        </p>
      </div>

      <ul className="flex flex-wrap items-center gap-4 font-mono text-[12px] text-body">
        {columns.map((column, index) => (
          <li key={column.id} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{
                background: column.isSelf ? "var(--ink)" : SERIES_COLORS[index % SERIES_COLORS.length],
              }}
            />
            {column.label}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-4">
        {dimensions.map((dimension) => (
          <div key={dimension} className="flex flex-col gap-2">
            <p className="text-sm text-body">{SEO_DIMENSION_LABELS[dimension]}</p>
            <ul className="flex flex-col gap-1.5">
              {columns.map((column, index) => {
                const value = column.dimensions[dimension] ?? null;
                const color = column.isSelf
                  ? "var(--ink)"
                  : SERIES_COLORS[index % SERIES_COLORS.length];
                return (
                  <li key={column.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-[11px] text-muted-foreground">
                      {column.label}
                    </span>
                    <span
                      role="img"
                      aria-label={
                        value == null
                          ? `${column.label} ${SEO_DIMENSION_LABELS[dimension]} not measured`
                          : `${column.label} ${SEO_DIMENSION_LABELS[dimension]} ${Math.round(value)} out of 100`
                      }
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-card"
                    >
                      {value == null ? null : (
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(2, Math.min(100, value))}%`,
                            background: color,
                          }}
                        />
                      )}
                    </span>
                    <span className="w-16 shrink-0 text-right font-mono text-[12px] tabular-nums text-body">
                      {value == null ? (
                        <span className="text-muted-soft">n/a</span>
                      ) : (
                        Math.round(value)
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
