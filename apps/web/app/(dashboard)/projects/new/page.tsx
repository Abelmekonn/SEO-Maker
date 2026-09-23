import { redirect } from "next/navigation";
import { UrlIntakeForm } from "@/components/project/UrlIntakeForm";
import { PageHeader, Panel } from "@/components/dashboard/shell";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const userId = await requireUserId();
  if (!userId) {
    redirect("/sign-in");
  }

  const { url } = await searchParams;
  const account = await getAccountForUser(userId);

  return (
    <Panel>
      <PageHeader
        title="Start with a URL"
        description="The first pass is the homepage. You add more pages when that pass is useful."
      />
      <UrlIntakeForm
        initialUrl={url ?? ""}
        canUseDeep={account.limits.deepMode}
        planLabel={account.limits.label}
      />
    </Panel>
  );
}
