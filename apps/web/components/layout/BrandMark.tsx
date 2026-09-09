import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";

export function BrandMark({
  href = "/",
  inverted = false,
}: {
  href?: string;
  inverted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        inverted ? "text-white" : "text-brand-charcoal",
      )}
    >
      <Image src="/logo.png" alt="SEO Maker" width={100} height={100} className="h-14 w-14 rounded-full" />
    </Link>
  );
}
