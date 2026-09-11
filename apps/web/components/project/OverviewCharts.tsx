import { cn } from "@/lib/utils";
import { scoreRating, type Rating } from "@/lib/performance";

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
  className,
  fit = false,
}: {
  values: Array<number | null | undefined>;
  label: string;
  className?: string;
  fit?: boolean;
}) {
  const points = values.map((value) =>
    typeof value === "number" ? Math.max(0, Math.min(100, value)) : null,
  );
  const known = points.filter((value): value is number => value != null);
  const w = 160;
  const h = 36;
  const pad = 3;

  if (known.length === 0) {
    return (
      <div
        className="flex h-9 w-full items-end justify-between gap-1"
        role="img"
        aria-label={`${label} has no series yet`}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <span key={index} className="w-full rounded-sm bg-surface-card" style={{ height: 8 }} />
        ))}
      </div>
    );
  }

  const series = known.length === 1 ? [known[0], known[0]] : points;
  const min = fit ? Math.min(...known) : 0;
  const max = fit ? Math.max(...known) : 100;
  const span = Math.max(4, max - min);
  const lo = fit ? min - span * 0.2 : 0;
  const hi = fit ? max + span * 0.2 : 100;
  const step = (w - pad * 2) / Math.max(1, series.length - 1);
  const y = (value: number) => pad + (1 - (value - lo) / (hi - lo)) * (h - pad * 2);
  const dots = series
    .map((value, index) =>
      value == null ? null : { x: pad + index * step, y: y(value) },
    )
    .filter((value): value is { x: number; y: number } => value != null);
  const line = dots.map((dot) => `${dot.x},${dot.y}`).join(" ");
  const area = dots.length
    ? `${pad},${h} ${line} ${dots[dots.length - 1].x},${h}`
    : "";
  const fillId = `spark-fill-${label.replace(/\s+/g, "-")}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-9 w-full overflow-visible text-good", className)}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <filter id={`${fillId}-shadow`} x="-20%" y="-40%" width="140%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000000" floodOpacity="0.4" />
        </filter>
      </defs>
      {area ? <polygon points={area} fill={`url(#${fillId})`} /> : null}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={`url(#${fillId}-shadow)`}
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

export function StatusColumns({
  items,
  label,
}: {
  items: Array<{ key: string; label: string; value: number; className: string }>;
  label: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-[140px] items-end gap-3"
    >
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <p className="font-mono text-[12px] tabular-nums text-ink">{item.value}</p>
          <div className="flex h-20 w-full items-end rounded-sm bg-surface-card">
            <span
              className={cn("w-full rounded-sm", item.className)}
              style={{ height: `${(item.value / max) * 100}%` }}
            />
          </div>
          <p className="text-center font-mono text-[11px] leading-4 text-muted-foreground">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}

export function HBarList({
  items,
  label,
}: {
  items: Array<{ key: string; label: string; value: number | null; suffix?: string }>;
  label: string;
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {items.map((item) => {
        const rating = scoreRating(item.value);
        return (
          <li key={item.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm text-ink">{item.label}</p>
              <p className={cn("shrink-0 font-mono text-[12px] tabular-nums", rating === "none" ? "text-muted-foreground" : ratingClass(rating))}>
                {item.value == null ? "-" : `${item.value}${item.suffix ?? ""}`}
              </p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-card">
              <span
                className={cn("block h-full rounded-full", bar[rating])}
                style={{ width: `${item.value == null ? 0 : Math.max(0, Math.min(100, item.value))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ratingClass(rating: Rating) {
  if (rating === "good") return "text-good";
  if (rating === "warn") return "text-warn";
  if (rating === "bad") return "text-bad";
  return "text-ink";
}

export function DonutChart({
  segments,
  center,
  centerHint = "pages",
  label,
}: {
  segments: Array<{ key: string; value: number; color: string; label: string }>;
  center: string;
  centerHint?: string;
  label: string;
}) {
  const size = 168;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const gap = total > 0 ? circumference * 0.030 : 0;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label={label}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="fill-none stroke-surface-card"
            strokeWidth={strokeWidth}
          />
          {total > 0
            ? segments.map((segment) => {
                const length = Math.max(0, (segment.value / total) * circumference - gap);
                const circle = (
                  <circle
                    key={segment.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += length + gap;
                return circle;
              })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="font-display text-[28px] leading-none tracking-[-0.5px] tabular-nums text-ink">
            {center}
          </p>
          <p className="mt-1 font-mono text-[12px] text-muted-foreground">{centerHint}</p>
        </div>
      </div>
      <ul className="flex min-w-[140px] flex-col gap-3">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2.5 font-mono text-[13px] text-body">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span>{segment.label}</span>
            <span className="ml-auto tabular-nums text-ink">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendLines({
  series,
  label,
  ticks,
}: {
  series: Array<{ key: string; label: string; values: Array<number | null>; color: string }>;
  label: string;
  ticks?: string[];
}) {
  const w = 640;
  const h = 248;
  const padLeft = 36;
  const padRight = 12;
  const padTop = 10;
  const padBottom = 28;
  const length = Math.max(2, ...series.map((item) => item.values.length));
  const innerW = w - padLeft - padRight;
  const innerH = h - padTop - padBottom;
  const step = innerW / Math.max(1, length - 1);

  function coords(values: Array<number | null>) {
    const filled = values.length < 2 && values[0] != null ? [values[0], values[0]] : values;
    return filled.flatMap((value, index) => {
      if (value == null) return [];
      return [
        {
          x: padLeft + index * step,
          y: padTop + (1 - Math.max(0, Math.min(100, value)) / 100) * innerH,
        },
      ];
    });
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[248px] w-full overflow-visible" role="img" aria-label={label}>
      <defs>
        <filter id="trend-shadow" x="-8%" y="-20%" width="116%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = padTop + (1 - tick / 100) * innerH;
        return (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={w - padRight}
              y1={y}
              y2={y}
              className="stroke-hairline"
              strokeWidth="1"
            />
            <text
              x={padLeft - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {tick}
            </text>
          </g>
        );
      })}
      {series.map((item) => {
        const dots = coords(item.values);
        const line = dots.map((dot) => `${dot.x},${dot.y}`).join(" ");
        return (
          <g key={item.key} filter="url(#trend-shadow)">
            <polyline
              points={line}
              fill="none"
              stroke={item.color}
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {dots.map((dot, index) => (
              <circle
                key={`${item.key}-${index}`}
                cx={dot.x}
                cy={dot.y}
                r="4"
                fill={item.color}
                stroke="#111111"
                strokeWidth="1.5"
              />
            ))}
          </g>
        );
      })}
      {ticks?.map((tick, index) => (
        <text
          key={`${tick}-${index}`}
          x={padLeft + index * step}
          y={h - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {tick}
        </text>
      ))}
    </svg>
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
