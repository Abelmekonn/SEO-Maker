/**
 * Brand-accent donut for the Competitors surface.
 *
 * Separate from ScoreRing because that one encodes good/warn/bad semantics.
 * Competitor confidence is a certainty measure, not a quality judgement, so it
 * uses the brand accent rather than a traffic-light color.
 */
export function CompetitorGauge({
  value,
  label,
  caption,
  size = 168,
  strokeWidth = 12,
}: {
  value: number | null;
  label: string;
  caption?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={value == null ? `${label}, not measured` : `${label} ${Math.round(pct)} out of 100`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="fill-none stroke-surface-card"
            strokeWidth={strokeWidth}
          />
          {value == null ? null : (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="fill-none stroke-primary"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          )}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          {value == null ? (
            <span className="px-4 text-center font-mono text-[11px] leading-4 text-muted-soft">
              Not measured
            </span>
          ) : (
            <>
              <span className="font-display text-[34px] leading-none tracking-[-0.8px] tabular-nums text-ink">
                {Math.round(pct)}
                <span className="text-[18px] text-muted-foreground">%</span>
              </span>
              {caption ? (
                <span className="mt-1 text-[11px] text-muted-foreground">{caption}</span>
              ) : null}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
