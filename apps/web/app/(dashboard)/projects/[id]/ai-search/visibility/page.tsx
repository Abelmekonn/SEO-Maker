import { notFound, redirect } from "next/navigation";
import { Eye, MessageSquareQuote, Quote, Users } from "lucide-react";
import { AiSearchHeader, NotAvailable } from "@/components/project/geo/AiSearchShell";
import { getProjectForUser, requireUserId } from "@/lib/projects";

/**
 * AI Visibility.
 *
 * This is the only screen in the product that reports what assistants actually
 * said, and nothing produces that data yet: there is no provider, no prompt
 * runs, and no stored responses. So it explains what it will measure and states
 * plainly that it is not measuring it. No sample numbers, no illustrative
 * chart — a mock here would be indistinguishable from a real reading.
 */
export default async function AiVisibilityPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const configured = project.aiVisibilityStatus !== "not_configured";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AiSearchHeader
        projectId={project.id}
        title="AI Visibility"
        description="Whether this site is actually mentioned and cited when assistants answer questions about your topic."
      />

      {configured ? (
        <NotAvailable
          title="No runs recorded yet"
          body="A provider is connected, but no prompts have been run against it for this project."
        />
      ) : (
        <NotAvailable
          title="AI visibility tracking is not configured yet"
          body="Measuring this means putting real questions to assistants and recording what comes back. That needs a provider, and none is connected, so nothing is being tracked."
          detail={[
            "Questions generated from your business, so they match what customers actually ask.",
            "Whether your site is mentioned in the answer, and whether it is cited as a source.",
            "Which pages get cited, and which competitors appear instead of you.",
          ]}
        />
      )}

      <section className="flex flex-col gap-4 rounded-xl bg-surface-soft p-5 ring-1 ring-hairline">
        <h2 className="text-[13px] font-semibold text-ink">What this will report</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          <Planned
            icon={MessageSquareQuote}
            title="Tracked prompts"
            body="The questions put to assistants, generated from your services, audience and location."
          />
          <Planned
            icon={Eye}
            title="Mentions"
            body="Answers that name this business, whether or not they link to it."
          />
          <Planned
            icon={Quote}
            title="Citations"
            body="Answers that cite a page on this site as a source, and which page."
          />
          <Planned
            icon={Users}
            title="Competing brands"
            body="Who gets named when you are not."
          />
        </ul>
        <p className="border-t border-hairline pt-3 text-[11px] leading-4 text-muted-soft">
          Readiness, on the AI Readiness page, is measured from your own site and is available now.
          It is a diagnostic of how well your site presents itself — not a prediction that any
          assistant will cite you. That only visibility tracking can answer, and only by asking.
        </p>
      </section>
    </div>
  );
}

function Planned({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Eye;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-2.5 rounded-lg bg-canvas px-4 py-3 ring-1 ring-hairline">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-soft" aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-soft">{body}</p>
      </div>
    </li>
  );
}
