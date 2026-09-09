import {
  PlaceholderCard,
  PlaceholderPage,
} from "@/components/layout/PlaceholderPage";

export default async function ProjectPageDetailPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { pageId } = await params;

  return (
    <PlaceholderCard>
      <PlaceholderPage
        title={`Page · ${pageId}`}
        description="Per-page audit and AI SEO suggestions will land in later slices."
      />
    </PlaceholderCard>
  );
}
