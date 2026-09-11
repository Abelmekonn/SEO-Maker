import { Sidebar } from "@/components/layout/Sidebar";
import { getAccountForUser } from "@/lib/plan";
import { requireUserId } from "@/lib/projects";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await requireUserId();
  const account = userId ? await getAccountForUser(userId) : null;

  return (
    <div className="dash-root flex min-h-screen bg-canvas text-ink">
      <Sidebar plan={account?.plan ?? "free"} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
