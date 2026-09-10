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
