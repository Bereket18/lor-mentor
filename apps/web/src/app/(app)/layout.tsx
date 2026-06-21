"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useAuth } from "@/hooks/use-auth";

const COLLAPSED_KEY = "lm-sidebar-collapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    // Lazily initialize from localStorage so no effect + setState cascade is needed
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });

  // Restore sidebar state from localStorage — handled by lazy initializer above

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && user === null) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || user === null || user === undefined) {
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base">
      {/* ── Sidebar — hidden on mobile, visible on desktop ── */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {/* ── Main content area ──────────────────────────────── */}
      <motion.div
        animate={{ marginLeft: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex-1 flex flex-col min-w-0 overflow-hidden"
      >
        {/* Top bar */}
        <Topbar />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </motion.div>

      {/* ── Mobile bottom navigation ────────────────────────── */}
      <MobileNav />
    </div>
  );
}
