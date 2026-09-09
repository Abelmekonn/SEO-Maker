import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  PlaceholderCard,
  PlaceholderPage,
} from "@/components/layout/PlaceholderPage";
import { DEMO_PROJECT_ID } from "@/lib/demo-project";

export default function ProjectPagesPage() {
  return (
    <PlaceholderCard>
      <PlaceholderPage
        title="Pages"
        description="The page audit table is empty until crawl jobs write page rows."
      />
      <Button asChild variant="outline">
        <Link href={`/projects/${DEMO_PROJECT_ID}/pages/home`}>
          Open demo page
        </Link>
      </Button>
    </PlaceholderCard>
  );
}
