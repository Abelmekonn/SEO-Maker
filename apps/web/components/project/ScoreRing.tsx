import { scoreRating, type Rating } from "@/lib/performance";
import { cn } from "@/lib/utils";

const stroke: Record<Rating, string> = {
  good: "stroke-good",
  warn: "stroke-warn",
  bad: "stroke-bad",
  none: "stroke-surface-strong",
};

const text: Record<Rating, string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  none: "text-muted-foreground",
};

export function ScoreRing({
  score,
  size = 28,
  strokeWidth = 3,
  label,
  showValue = false,
  centerValue = false,
  stackValue = false,
  tone,
}: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
  label: string;
  showValue?: boolean;
  centerValue?: boolean;
  stackValue?: boolean;
  tone?: Rating;
}) {
  const rating = tone ?? scoreRating(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - pct / 100);
  const display = score == null ? "-" : `${score}/100`;

  const ring = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="-rotate-90"
      role="img"
      aria-label={score == null ? `${label}, no score yet` : `${label} ${score} out of 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className="fill-none stroke-surface-strong"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        className={cn("fill-none", stroke[rating])}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  );

  if (centerValue) {
    return (
      <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        {ring}
        {stackValue ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[22px] leading-none tracking-[-0.4px] tabular-nums text-ink">
              {score == null ? "-" : score}
            </span>
            <span className="font-mono text-[11px] leading-4 text-muted-foreground">/100</span>
          </span>
        ) : (
          <span
            className={cn(
              "absolute inset-0 flex items-center justify-center font-display text-[18px] leading-none tracking-[-0.4px] tabular-nums",
              text[rating],
            )}
          >
            {display}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      {ring}
      {showValue ? (
        <span className={cn("font-mono text-[12px] tabular-nums", text[rating])}>{display}</span>
      ) : null}
    </span>
  );
}
