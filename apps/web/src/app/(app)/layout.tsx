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
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  useEffect(() => {
    if (!loading && user === null) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || user === null || user === undefined) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#060B14" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "rgba(45,212,191,0.6)", borderTopColor: "transparent" }}
          />
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "#060B14", position: "relative" }}
    >
      {/* ── Animated background gradient ──────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 20% 10%,  rgba(20,184,166,0.06) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 85% 90%,  rgba(14,165,233,0.05) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 50% 50%,  rgba(6,11,20,0) 0%, transparent 100%)
          `,
          animation: "appBgPulse 20s ease-in-out infinite",
        }}
      />

      <style>{`
        @keyframes appBgPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.7; }
        }
      `}</style>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <div className="relative z-10 hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <motion.div
        animate={{ marginLeft: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative z-10 flex-1 flex flex-col min-w-0 overflow-hidden"
      >
        {/* Glass topbar — content scrolls under it */}
        <div
          className="sticky top-0 z-40 flex-shrink-0"
          style={{
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            background: "rgba(6,11,20,0.75)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 1px 0 rgba(45,212,191,0.05), 0 4px 24px rgba(0,0,0,0.2)",
          }}
        >
          <Topbar />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </motion.div>

      {/* ── Mobile nav ───────────────────────────────────────────── */}
      <MobileNav />
    </div>
  );
}
