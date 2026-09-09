import Link from "next/link";
import { CircleHelp, FolderPlus, LayoutDashboard } from "lucide-react";
import { BrandMark } from "@/components/layout/BrandMark";

const company = [
  { href: "/", label: "Home" },
  { href: "/#features", label: "Features" },
  { href: "/#process", label: "Process" },
  { href: "/#faq", label: "FAQ" },
];

const resources = [
  { href: "/#pricing", label: "Pricing" },
  { href: "/pricing", label: "Compare plans" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects/demo", label: "Demo" },
];

const footerLinkClass =
  "inline-flex min-h-11 items-center text-sm hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none active:text-white";

const contact = [
  { href: "/projects/new", label: "Start a project", icon: FolderPlus },
  { href: "/dashboard", label: "Open the dashboard", icon: LayoutDashboard },
  { href: "/#faq", label: "Read the FAQ", icon: CircleHelp },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-mkt-hairline px-6 py-16 text-mkt-muted">
      <div className="mx-auto grid max-w-7xl gap-12 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <BrandMark inverted />
          <p className="mt-4 max-w-xs text-sm leading-6">
            Site audits, page recommendations, and competitor comparison in one
            project.
          </p>
        </div>

        <div>
          <p className="font-heading text-sm font-medium text-white">Company</p>
          <ul className="mt-5 flex flex-col gap-3">
            {company.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-heading text-sm font-medium text-white">
            Resources
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {resources.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={footerLinkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="font-heading text-sm font-medium text-white">
            Get in touch
          </p>
          <ul className="mt-5 flex flex-col gap-4">
            {contact.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 items-start gap-3 py-2 text-sm hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none active:text-white"
                  >
                    <Icon
                      className="mt-0.5 size-4 shrink-0 text-brand-orange"
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <p className="mx-auto mt-16 max-w-7xl border-t border-mkt-hairline pt-6 text-center text-xs text-mkt-subtle">
        © 2026 SEO Maker. Plans are limited by page count. We only store a URL
        if you start a project.
      </p>
    </footer>
  );
}
