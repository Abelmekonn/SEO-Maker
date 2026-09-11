import type { ReactNode } from "react";
import { PageHeader, Panel } from "@/components/dashboard/shell";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return <PageHeader title={title} description={description} />;
}

export function PlaceholderCard({
  children,
}: {
  children: ReactNode;
}) {
  return <Panel>{children}</Panel>;
}

export function LaterSlice({ title }: { title: string }) {
  return (
    <PlaceholderCard>
      <PlaceholderPage
        title={title}
        description={`${title} lands in a later slice.`}
      />
    </PlaceholderCard>
  );
}
