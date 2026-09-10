import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dash-root flex min-h-screen bg-canvas text-ink">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
