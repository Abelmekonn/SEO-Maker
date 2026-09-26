import { redirect } from "next/navigation";
import { QuickSearchPanel } from "@/components/quick/QuickSearchPanel";
import { requireUserId } from "@/lib/projects";

/** Quick Search: a lightweight inspection of any URL, on every plan. */
export default async function QuickSearchPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { url } = await searchParams;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="flex max-w-3xl flex-col gap-2">
        <p className="font-mono text-[12px] text-primary">Quick Search</p>
        <h1 className="font-display text-[30px] leading-[1.1] tracking-[-0.8px] text-ink">Inspect any page in seconds</h1>
        <p className="text-sm leading-6 text-body">
          Status, title, meta description, headings, canonical, indexability and a few technical basics, from a single
          short request. For the whole site, with evidence, performance and AI, run a Deep Analysis.
        </p>
      </header>
      <div className="max-w-3xl">
        <QuickSearchPanel initialUrl={url ?? ""} />
      </div>
    </div>
  );
}
