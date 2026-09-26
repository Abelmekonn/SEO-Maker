import type { ReactNode } from "react";
import Link from "next/link";
import { Lock, Network, Sparkles, Swords } from "lucide-react";
import type { PlanLimits } from "@/lib/plan";
import { cn } from "@/lib/utils";

/**
 * The AI Workspace's shared header: where you are, the three capabilities as
 * tabs, and the screen's main action. Every AI screen starts with it, so Page,
 * Site and Competitor AI read as one workspace rather than three features.
 */

export type AiTab = "pages" | "site" | "competitors";

const TABS: Array<{ id: AiTab; label: string; icon: typeof Sparkles; allowed: (limits: PlanLimits) => boolean }> = [
  { id: "pages", label: "Page Analysis", icon: Sparkles, allowed: (limits) => limits.ai },
  { id: "site", label: "Site Strategy", icon: Network, allowed: (limits) => limits.siteAi },
  { id: "competitors", label: "Competitor Analysis", icon: Swords, allowed: (limits) => limits.competitorAi },
];

export function AiWorkspaceHeader({
  projectId,
  siteName,
  active,
  limits,
  title,
  description,
  actions,
  businessContext,
}: {
  projectId: string;
  siteName: string;
  active: AiTab;
  limits: PlanLimits;
  title: string;
  description: string;
  actions?: ReactNode;
  /** Whether AI has the site's business context to work with. */
  businessContext?: boolean;
}) {
  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 max-w-2xl flex-col gap-2">
          <p className="font-mono text-[12px] text-primary">
            AI Workspace <span className="text-muted-foreground">· {siteName}</span>
          </p>
          <h1 className="font-display text-[30px] leading-none tracking-[-0.8px] text-ink">{title}</h1>
          <p className="text-sm leading-6 text-body">{description}</p>
          {businessContext != null ? (
            <Link
              href={`/projects/${projectId}/settings`}
              className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-card px-2.5 py-1 font-mono text-[12px] text-body hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("size-1.5 rounded-full", businessContext ? "bg-good" : "bg-muted-foreground")} aria-hidden />
              {businessContext ? "Uses your business context" : "No business context: add it for sharper advice"}
            </Link>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-start gap-3">{actions}</div> : null}
      </div>
      <nav aria-label="AI Workspace" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-hairline px-1">
          {TABS.map((tab) => {
            const current = tab.id === active;
            const locked = !tab.allowed(limits);
            return (
              <li key={tab.id}>
                <Link
                  href={`/projects/${projectId}/ai/${tab.id}`}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    current ? "border-primary text-ink" : "border-transparent text-muted-foreground hover:text-ink",
                  )}
                >
                  <tab.icon className="size-3.5" aria-hidden />
                  {tab.label}
                  {locked ? (
                    <>
                      <Lock className="size-3 opacity-70" aria-hidden />
                      <span className="sr-only">(not in your plan)</span>
                    </>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
