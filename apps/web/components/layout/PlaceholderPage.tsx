import type { ReactNode } from "react";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <h2 className="font-display text-[28px] leading-[1.2] tracking-[-0.5px] text-ink">
        {title}
      </h2>
      <p className="text-sm leading-6 text-body">{description}</p>
    </div>
  );
}

export function PlaceholderCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-6 rounded-lg bg-canvas p-8 ring-1 ring-hairline">
      {children}
    </div>
  );
}
