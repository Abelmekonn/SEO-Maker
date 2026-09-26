import { redirect } from "next/navigation";

/** The old AI workspace address. Page AI now lives in the AI Workspace. */
export default async function SuggestionsRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/ai/pages`);
}
