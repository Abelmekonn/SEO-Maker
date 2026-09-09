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
  { href: "/#pricing", label: "Pricing" },
];

const linkClass =
  "font-mono text-sm font-medium text-mkt-muted hover:text-white focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none active:text-white";

export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-mkt-hairline bg-mkt-canvas/80 backdrop-blur-md">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-black"
      >
        Skip to content
      </a>
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto] items-center px-6 md:grid-cols-[1fr_auto_1fr]">
        <BrandMark inverted />

        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className={`${linkClass} py-2`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            asChild
            className="hidden h-11 border-mkt-hairline bg-transparent text-white hover:bg-white/5 hover:text-white sm:inline-flex"
          >
            <Link href="/dashboard">Login</Link>
          </Button>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-md text-white hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none md:hidden"
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
                className={`${linkClass} rounded-md px-3 py-3 hover:bg-white/5`}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/dashboard"
              className={`${linkClass} rounded-md px-3 py-3 hover:bg-white/5 sm:hidden`}
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
