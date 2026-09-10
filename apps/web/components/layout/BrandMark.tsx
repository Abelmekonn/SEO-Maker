import Link from "next/link";
import { cn } from "@/lib/utils";
import Image from "next/image";

export function BrandMark({
  href = "/",
  inverted = false,
  compact = false,
  wordmark = false,
}: {
  href?: string;
  inverted?: boolean;
  compact?: boolean;
  wordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        inverted ? "text-white" : "text-brand-charcoal",
      )}
    >
      <Image
        src="/logo.png"
        alt={wordmark ? "" : "SEO Maker"}
        width={100}
        height={100}
        className={cn("rounded-full", compact ? "h-9 w-9" : "h-14 w-14")}
      />
      {wordmark ? (
        <span className="font-display text-[15px] font-semibold leading-5 tracking-[-0.2px]">
          SEO Maker
        </span>
      ) : null}
    </Link>
  );
}
