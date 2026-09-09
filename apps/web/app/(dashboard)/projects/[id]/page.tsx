import {
  PlaceholderCard,
  PlaceholderPage,
} from "@/components/layout/PlaceholderPage";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <PlaceholderCard>
      <PlaceholderPage
        title={`Overview · ${id}`}
        description="Overall score, technical summary, and top issues will appear here after the crawler exists."
      />
    </PlaceholderCard>
  );
}
