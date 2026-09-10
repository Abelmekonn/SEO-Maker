import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/dashboard/shell";

export default function ProjectNotFound() {
  return (
    <Panel>
      <PageHeader
        title="Project not found"
        description="That project is missing or belongs to another account."
        actions={
          <Button asChild className="h-11 w-fit">
            <Link href="/dashboard">All projects</Link>
          </Button>
        }
      />
    </Panel>
  );
}
