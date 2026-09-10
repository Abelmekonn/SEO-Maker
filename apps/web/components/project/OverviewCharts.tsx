import { cn } from "@/lib/utils";
import type { Rating } from "@/lib/performance";

const stroke: Record<Rating, string> = {
  good: "stroke-good",
  warn: "stroke-warn",
  bad: "stroke-bad",
  none: "stroke-surface-strong",
};

const bar: Record<Rating, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  none: "bg-surface-strong",
};

function gaugePoint(cx: number, cy: number, r: number, pct: number) {
  const angle = Math.PI * (1 - pct);
  return {
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  };
}

export function SemiGauge({
  value,
  label,
  rating,
  loading,
}: {
  value: number | null;
  label: string;
  rating: Rating;
  loading?: boolean;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const cx = 70;
  const cy = 76;
  const r = 48;
  const strokeWidth = 8;
  const track = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const needle = gaugePoint(cx, cy, 30, pct);

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="flex items-center gap-1.5 font-mono text-[13px] leading-4 text-body">
        <span aria-hidden className={cn("size-1.5 rounded-full", bar[rating])} />
        {label} -{" "}
        <span className="tabular-nums text-ink">{value ?? "-"}</span>
      </p>
      <svg
        viewBox="0 0 140 88"
        className="h-[88px] w-[140px]"
        role="img"
        aria-label={
          loading
            ? `${label} is measuring`
            : value == null
              ? `${label} has no score yet`
              : `${label} ${value} out of 100`
        }
      >
        <path
          d={track}
          pathLength={100}
          className="fill-none stroke-surface-strong"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {pct > 0 ? (
          <path
            d={track}
            pathLength={100}
            className={cn("fill-none", stroke[rating])}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${pct * 100} 100`}
          />
        ) : null}
        <line
          x1={cx}
          y1={cy}
          x2={needle.x}
          y2={needle.y}
          className="stroke-ink"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="3.5" className="fill-ink" />
      </svg>
    </div>
  );
}

export function ScoreSpark({
  values,
  label,
}: {
  values: Array<number | null | undefined>;
  label: string;
}) {
  const points = values.map((value) =>
    typeof value === "number" ? Math.max(0, Math.min(100, value)) : null,
  );
  const known = points.filter((value): value is number => value != null);
  const w = 120;
  const h = 40;
  const pad = 3;

  if (known.length < 2) {
    return (
      <div
        className="flex h-10 w-[120px] items-end justify-between gap-1"
        role="img"
        aria-label={`${label} has no series yet`}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <span key={index} className="w-full rounded-sm bg-surface-card" style={{ height: 8 }} />
        ))}
      </div>
    );
  }

  const step = (w - pad * 2) / (points.length - 1);
  const y = (value: number) => pad + (1 - value / 100) * (h - pad * 2);
  const coords = points
    .map((value, index) => {
      if (value == null) return null;
      return `${pad + index * step},${y(value)}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-[120px]" role="img" aria-label={label}>
      <polyline
        points={coords}
        className="fill-none stroke-good"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProgressBar({
  value,
  max = 100,
  rating = "none",
  label,
  accent = false,
}: {
  value: number;
  max?: number;
  rating?: Rating;
  label: string;
  accent?: boolean;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-card"
      >
        <span
          className={cn("block h-full rounded-full", accent ? "bg-primary" : bar[rating])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SegmentBar({
  segments,
  label,
}: {
  segments: Array<{ key: string; value: number; className: string }>;
  label: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-card"
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={segment.className}
          style={{ width: `${(segment.value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}
