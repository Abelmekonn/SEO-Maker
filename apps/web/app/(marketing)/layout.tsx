import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { MarketingHeader } from "@/components/layout/MarketingHeader";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mkt-root flex min-h-screen flex-col bg-mkt-canvas text-mkt-ink">
      <MarketingHeader />
      <main id="main-content" className="flex-1 focus:outline-none" tabIndex={-1}>
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
