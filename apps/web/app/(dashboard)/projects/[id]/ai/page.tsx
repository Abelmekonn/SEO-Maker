import { redirect } from "next/navigation";

/** The AI Workspace opens on Page Analysis. */
export default async function AiWorkspaceIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/ai/pages`);
}
