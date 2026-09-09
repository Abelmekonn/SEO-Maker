import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  PlaceholderCard,
  PlaceholderPage,
} from "@/components/layout/PlaceholderPage";
import { DEMO_PROJECT_ID } from "@/lib/demo-project";

export default function DashboardPage() {
  return (
    <PlaceholderCard>
      <PlaceholderPage
        title="Projects"
        description="Project list and crawl status will show here after auth and the database are added."
      />
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/projects/new">New project</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/projects/${DEMO_PROJECT_ID}`}>Open demo project</Link>
        </Button>
      </div>
    </PlaceholderCard>
  );
}
