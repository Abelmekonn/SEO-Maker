import { LaterSlice } from "@/components/layout/PlaceholderPage";
import { PremiumRoute } from "@/components/project/PremiumRoute";

export default async function ProjectToolsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PremiumRoute projectId={id} feature="tools">
      <LaterSlice title="Tools" />
    </PremiumRoute>
  );
}
