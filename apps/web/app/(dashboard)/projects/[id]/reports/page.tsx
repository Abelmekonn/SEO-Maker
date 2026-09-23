import { LaterSlice } from "@/components/layout/PlaceholderPage";
import { PremiumRoute } from "@/components/project/PremiumRoute";

export default async function ProjectReportsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PremiumRoute projectId={id} feature="reports">
      <LaterSlice title="Reports" />
    </PremiumRoute>
  );
}
