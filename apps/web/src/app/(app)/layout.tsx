"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useAuth } from "@/hooks/use-auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  // Redirect to login if not authenticated
  // This is a CLIENT-SIDE redirect for UX only
  // Server-side protection is enforced by the backend on every API call
  useEffect(() => {
    if (!loading && user === null) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Show nothing while checking auth status
  // Prevents flash of wrong content
  if (loading || user === null || user === undefined) {
    return (
      <div
        className="min-h-screen bg-base flex items-center
        justify-center"
      >
        <div className="flex flex-col items-center gap-3">
          {/* Animated loading spinner */}
          <div
            className="w-8 h-8 border-2 border-accent
            border-t-transparent rounded-full animate-spin"
          />
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      {/* ── Sidebar — hidden on mobile, visible on desktop ── */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* ── Main content area ──────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <Topbar />

        {/* Page content */}
        <main
          className="
          flex-1 overflow-y-auto
          p-6
          pb-20 lg:pb-6
        "
        >
          {children}
        </main>
      </div>

      {/* ── Mobile bottom navigation ────────────────────────── */}
      <MobileNav />
    </div>
  );
}
