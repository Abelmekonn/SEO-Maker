import { UrlIntakeForm } from "@/components/project/UrlIntakeForm";
import { PageHeader, Panel } from "@/components/dashboard/shell";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;

  return (
    <Panel>
      <PageHeader
        title="Start with a URL"
        description="The first pass is the homepage. You add more pages when that pass is useful."
      />
      <UrlIntakeForm initialUrl={url ?? ""} />
    </Panel>
  );
}
