import { ApiStatusBanner } from "@/components/ApiStatusBanner";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { WorkspaceProvider } from "@/lib/workspace";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      {/*
        Column on small screens, row from lg. The sidebar renders both a desktop
        rail (lg only) and a mobile header; in a row container the mobile header
        became a sibling flex item, which shrank the content column to zero
        width on phones.
      */}
      <div className="flex min-h-screen flex-col bg-mist-100 lg:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1380px] px-4 py-6 md:px-7 md:py-8">
              <ApiStatusBanner />
              {children}
            </div>
          </main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
