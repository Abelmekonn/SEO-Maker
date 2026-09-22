import { notFound, redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { BusinessContextForm } from "@/components/project/BusinessContextForm";
import { contextCompleteness, readBusinessContext } from "@/lib/business-context";
import { getProjectForUser, requireUserId } from "@/lib/projects";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { id } = await params;
  const project = await getProjectForUser(id, userId);
  if (!project) {
    notFound();
  }

  const context = readBusinessContext(project);
  const completeness = Math.round(contextCompleteness(context) * 100);

  return (
    <Panel>
      <PageHeader
        title="Business context"
        description={
          project.analysisMode === "deep"
            ? `Deep analysis is on. Context is ${completeness}% complete — the more you fill in, the more specific the recommendations can be.`
            : "This project runs in Quick mode from the URL alone. Add context here to switch it to Deep analysis."
        }
      />
      <BusinessContextForm projectId={project.id} initial={context} />
    </Panel>
  );
}
