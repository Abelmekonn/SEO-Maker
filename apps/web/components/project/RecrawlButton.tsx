import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Re-crawl Site": opens the crawl screen, where the user chooses which of the
 * site's known pages to fetch again. Nothing starts until they confirm there,
 * and a re-crawl never re-classifies a page.
 */
export function RecrawlButton({
  projectId,
  appearance = "outline",
}: {
  projectId: string;
  appearance?: "outline" | "primary";
}) {
  return (
    <Button
      asChild
      variant={appearance === "primary" ? "default" : "outline"}
      className={cn("h-11 w-fit", appearance === "primary" && "rounded-full px-5")}
    >
      <Link href={`/projects/${projectId}/crawl`}>
        <RefreshCw className="size-3.5" aria-hidden />
        Re-crawl Site
      </Link>
    </Button>
  );
}
