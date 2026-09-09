import { cn } from "@/lib/utils";

const rows = [
  ["/", "Analyzed", "82"],
  ["/pricing", "Analyzed", "74"],
  ["/blog", "Crawling", "—"],
  ["/docs", "Pending", "—"],
];

export function DashboardPreview({
  className,
  caption = "Overview",
}: {
  className?: string;
  caption?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-brand-charcoal",
        className,
      )}
    >
      <div className="flex min-h-[280px] md:min-h-[340px]">
        <aside className="hidden w-40 shrink-0 border-r border-white/10 p-4 md:block">
          <p className="text-[11px] font-medium tracking-wide text-white/40">
            SEO Maker
          </p>
          <ul className="mt-6 space-y-3 text-sm text-white/50">
            <li className="text-white">Overview</li>
            <li>Pages</li>
            <li>Performance</li>
            <li>Competitors</li>
          </ul>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col p-4 md:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[13px] text-white/45">{caption}</p>
              <p className="mt-1 font-display text-3xl tracking-[-0.04em] text-white">
                78
              </p>
            </div>
            <svg
              viewBox="0 0 220 72"
              className="h-16 w-40 text-white/80"
              aria-hidden
            >
              <path
                d="M2 58 C 28 52, 40 40, 58 36 S 90 44, 110 28 S 150 12, 176 20 S 206 8, 218 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M2 64 C 34 60, 48 50, 72 48 S 108 54, 132 40 S 168 30, 218 24"
                fill="none"
                stroke="rgb(129 140 248)"
                strokeWidth="2"
                opacity="0.85"
              />
            </svg>
          </div>
          <div className="mt-6 overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[1fr_auto_auto] bg-white/5 px-4 py-2 text-[12px] text-white/40">
              <span>Page</span>
              <span className="pr-8">Status</span>
              <span>Score</span>
            </div>
            {rows.map(([page, status, score]) => (
              <div
                key={page}
                className="grid grid-cols-[1fr_auto_auto] border-t border-white/10 px-4 py-2.5 text-sm"
              >
                <span className="font-mono text-white/85">{page}</span>
                <span className="pr-8 text-white/45">{status}</span>
                <span className="text-white">{score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
