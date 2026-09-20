import { Clock, Globe, Search, Users } from "lucide-react";

type Stat = {
  id: string;
  label: string;
  value: string;
  hint: string | null;
  icon: typeof Search;
  tone: "accent" | "neutral" | "good" | "slate";
};

const toneClass: Record<Stat["tone"], string> = {
  accent: "bg-primary/15 text-primary",
  neutral: "bg-surface-card text-body",
  good: "bg-good/15 text-good",
  slate: "bg-surface-card text-muted-foreground",
};

export function CompetitorStatCards({
  searchesAnalyzed,
  domainsDiscovered,
  strongCompetitors,
  lastAnalysis,
  discoveryRun,
}: {
  searchesAnalyzed: number;
  domainsDiscovered: number;
  strongCompetitors: number;
  lastAnalysis: string | null;
  discoveryRun: boolean;
}) {
  const notRunYet = discoveryRun ? null : "Run discovery";

  const stats: Stat[] = [
    {
      id: "searches",
      label: "Searches analyzed",
      value: searchesAnalyzed === 0 ? "—" : String(searchesAnalyzed),
      hint: searchesAnalyzed === 0 ? notRunYet : "Queries tracked for this site",
      icon: Search,
      tone: "accent",
    },
    {
      id: "domains",
      label: "Domains discovered",
      value: domainsDiscovered === 0 ? "—" : String(domainsDiscovered),
      hint: domainsDiscovered === 0 ? notRunYet : "Seen across your searches",
      icon: Globe,
      tone: "neutral",
    },
    {
      id: "strong",
      label: "Strong competitors",
      value: strongCompetitors === 0 ? "—" : String(strongCompetitors),
      hint:
        strongCompetitors === 0
          ? "None scored above 75 yet"
          : "Confidence 75 or higher",
      icon: Users,
      tone: "good",
    },
    {
      id: "last",
      label: "Last analysis",
      value: lastAnalysis ?? "Never",
      hint: lastAnalysis ? "Completed" : notRunYet,
      icon: Clock,
      tone: "slate",
    },
  ];

  return (
    <section aria-label="Discovery summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.id}
            className="flex items-start gap-3 rounded-xl bg-surface-soft p-4 ring-1 ring-hairline"
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass[stat.tone]}`}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[12px] text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-display text-[24px] leading-none tracking-[-0.5px] tabular-nums text-ink">
                {stat.value}
              </p>
              {stat.hint ? (
                <p className="mt-1.5 truncate text-[11px] text-muted-soft">{stat.hint}</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}
