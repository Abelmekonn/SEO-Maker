import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  wide = false,
  full = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
  full?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline sm:p-8",
        full && "min-h-full w-full flex-1",
        !full && (wide ? "max-w-5xl" : "max-w-3xl"),
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 max-w-2xl flex-col gap-2">
        <h1 className="font-display text-[28px] leading-[1.2] tracking-[-0.5px] text-ink">
          {title}
        </h1>
        {meta}
        {description ? (
          <p className="text-sm leading-6 text-body">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-start gap-3">{actions}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  className,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "flex min-h-[96px] flex-col gap-1 rounded-lg bg-surface-soft p-4 ring-1 ring-hairline",
        className,
      )}
    >
      <p className="font-mono text-[12px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-display text-[24px] leading-7 tracking-[-0.5px] tabular-nums",
          tone === "good" && "text-good",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-bad",
          tone === "default" && "text-ink",
        )}
      >
        {value}
      </p>
      {hint ? <p className="truncate text-xs leading-5 text-body">{hint}</p> : null}
    </div>
  );
}
