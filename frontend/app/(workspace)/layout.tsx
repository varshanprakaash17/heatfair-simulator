import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { WorkspaceProvider } from "@/lib/workspace";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <div className="flex min-h-screen bg-mist-100">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1380px] px-4 py-6 md:px-7 md:py-8">{children}</div>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
