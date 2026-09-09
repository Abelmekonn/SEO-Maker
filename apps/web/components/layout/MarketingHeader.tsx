"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/#features", label: "Features" },
  { href: "/#process", label: "Process" },
  { href: "/#faq", label: "FAQ" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-mkt-canvas/50 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center  md:grid-cols-[1fr_auto_1fr]">
        <BrandMark inverted />

        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="font-mono text-sm font-medium text-mkt-muted active:text-mkt-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            asChild
            className="hidden border-mkt-hairline bg-transparent text-mkt-ink active:bg-white/5 sm:inline-flex"
          >
            <Link href="/dashboard">Login</Link>
          </Button>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-mkt-ink md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
            <span className="sr-only">Menu</span>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className="border-t border-mkt-hairline px-6 py-4 md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-3 font-mono text-sm font-medium text-mkt-muted active:bg-white/5 active:text-mkt-ink"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className="rounded-md px-3 py-3 font-mono text-sm font-medium text-mkt-muted active:bg-white/5 active:text-mkt-ink sm:hidden"
              onClick={() => setOpen(false)}
            >
              Login
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
