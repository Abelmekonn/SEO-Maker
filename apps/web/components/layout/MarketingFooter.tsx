import Link from "next/link";
import { BrandMark } from "@/components/layout/BrandMark";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#how", label: "Technology" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Pages",
    links: [
      { href: "/projects/new", label: "New project" },
      { href: "/projects/demo", label: "Demo" },
      { href: "/pricing", label: "Plans" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="px-6 py-16 text-brand-silver">
      <div className="mx-auto grid max-w-5xl gap-12 border-t border-white/10 pt-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <BrandMark inverted />
          <p className="mt-4 max-w-xs text-sm leading-6">
            Site audits, page recommendations, and competitor comparison.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="font-heading text-sm font-medium text-white">
              {column.title}
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-brand-silver active:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-5xl flex-col justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/30 sm:flex-row">
        <p>SEO Maker. Page-count limits are the cost control.</p>
        <p>Privacy and terms come with auth.</p>
      </div>
    </footer>
  );
}
