import { notFound, redirect } from "next/navigation";
import { CrawlRefresh } from "@/components/project/CrawlRefresh";
import { AiSearchHeader, NotAvailable } from "@/components/project/geo/AiSearchShell";
import { GeoRunButton } from "@/components/project/geo/GeoRunButton";
import {
  GEO_ACTIVE,
  dimensionRows,
  getCitationSignals,
  getLatestGeoAudit,
} from "@/lib/geo";
import { getProjectForUser, requireUserId } from "@/lib/projects";
import { cn } from "@/lib/utils";

/** The signals citation readiness is built from, in the order they are scored. */
const SIGNALS = [
  {
    key: "specificity",
    label: "Specific facts",
    body: "Numbers with units, prices, percentages and dates. Concrete statements are what an assistant can quote; adjectives are not.",
  },
  {
    key: "freshness",
    label: "Freshness",
    body: "Published or updated dates on articles and documentation.",
  },
  {
    key: "attribution",
    label: "Attribution",
    body: "A named author or organisation, and outbound links to sources you rely on.",
  },
  {
    key: "identity",
    label: "Identity",
    body: "Organisation schema with a name and URL, a contact page, and a reachable phone or address.",
  },
  {
    key: "definition",
    label: "Definitions",
    body: "Plain statements of what a thing is, which is the shape an extractive answer reaches for.",
  },
  {
    key: "faq",
    label: "Questions answered",
    body: "FAQ markup, or headings written as the questions people actually ask.",
  },
  {
    key: "claim",
    label: "Supported claims",
    body: "Claims the site makes about itself, and whether each one is sourced, self-asserted or vague.",
  },
];

const statusTone: Record<string, string> = {
  present: "bg-good/15 text-good",
  weak: "bg-warn/15 text-warn",
  absent: "bg-bad/15 text-bad",
};

export default async function AiCitationsPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const audit = await getLatestGeoAudit(project.id);
  const signals = audit ? await getCitationSignals(project.id, audit.id) : [];
  const rows = dimensionRows(audit as Record<string, unknown> | null);
  const citation = rows.find((row) => row.id === "citationReadiness");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <CrawlRefresh status={project.geoStatus} intervalMs={3000} />

      <AiSearchHeader
        projectId={project.id}
        title="AI Citations"
        description="How quotable and verifiable these pages are. A diagnostic of what an assistant would have to work with — not a prediction that one will cite you."
        action={
          <GeoRunButton
            projectId={project.id}
            active={GEO_ACTIVE.has(project.geoStatus)}
            hasResults={audit != null}
            disabled={!project.latestCrawlId}
          />
        }
      />

      {citation?.value == null ? (
        <NotAvailable
          title="Citation readiness has not been measured"
          body={
            citation?.reason ??
            "The analysis has not scored this signal yet, so nothing here is a reading of your site."
          }
        />
      ) : (
        <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <h2 className="text-[13px] font-semibold text-ink">Citation readiness</h2>
          <p className="font-display text-[32px] leading-none text-ink">{citation.value}</p>
        </section>
      )}

      {signals.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
          <h2 className="text-[13px] font-semibold text-ink">Observed signals</h2>
          <ul className="flex flex-col gap-2">
            {signals.map((signal) => (
              <li
                key={signal.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-canvas px-3 py-2.5 ring-1 ring-hairline"
              >
                <div className="min-w-0">
                  <p className="text-[12px] font-medium capitalize text-ink">{signal.signal}</p>
                  {signal.claimText ? (
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
                      &ldquo;{signal.claimText}&rdquo;
                    </p>
                  ) : null}
                  {signal.recommendation ? (
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">
                      {signal.recommendation}
                    </p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize leading-4",
                    statusTone[signal.status] ?? "bg-surface-card text-muted-foreground",
                  )}
                >
                  {signal.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <h2 className="text-[13px] font-semibold text-ink">What gets measured</h2>
        <ul className="flex flex-col gap-2">
          {SIGNALS.map((signal) => (
            <li key={signal.key} className="rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline">
              <p className="text-[12px] font-medium text-ink">{signal.label}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">{signal.body}</p>
            </li>
          ))}
        </ul>
        <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
          Every claim shown here is verified to be a literal substring of the crawled page before it
          is stored, so this list can never contain a sentence your site does not actually say.
        </p>
      </section>
    </div>
  );
}
