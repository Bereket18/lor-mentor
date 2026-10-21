"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { useAuth } from "@/hooks/use-auth";
import { isAllowed, homeFor } from "@/lib/route-access";

const COLLAPSED_KEY = "lm-sidebar-collapsed";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // The mobile drawer re-uses the full desktop sidebar. Close it whenever
  // the route changes (including tapping the item for the current page).
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  useEffect(() => {
    if (loading) return;
    // Not logged in → send to login
    if (user === null) {
      router.push("/login");
      return;
    }
    // Logged in but visiting an area their role may not access → bounce home
    if (user && !isAllowed(pathname, user.role)) {
      router.replace(homeFor(user.role));
    }
  }, [user, loading, router, pathname]);

  if (
    loading ||
    user === null ||
    user === undefined ||
    !isAllowed(pathname, user.role)
  ) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: "var(--teal)", borderTopColor: "transparent" }}
          />
          <p className="text-sm text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg-base)", position: "relative" }}
    >
      {/* -- Animated background gradient ------------------------ */}
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

      {/* -- Sidebar ----------------------------------------------- */}
      <div className="relative z-10 hidden lg:block">
        <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      </div>

      {/* -- Main content ------------------------------------------- */}
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
            background: "var(--glass-bg)",
            borderBottom: "1px solid var(--glass-border)",
            boxShadow: "0 1px 0 var(--teal-glow), 0 4px 24px rgba(0,0,0,0.15)",
          }}
        >
          <Topbar
            onMenuToggle={() => setMobileMenuOpen(true)}
            drawerOpen={mobileMenuOpen}
          />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </motion.div>

      {/* -- Mobile drawer: the full PC sidebar ---------------------- */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="fixed inset-0 z-[60] lg:hidden"
        >
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 w-full cursor-default bg-black/60 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="relative h-full w-56 shadow-2xl"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) {
                setMobileMenuOpen(false);
              }
            }}
          >
            <Sidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
            />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="absolute right-2 top-[22px] z-20 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--teal-dim)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        </div>
      )}

      {/* -- Mobile nav --------------------------------------------- */}
      <MobileNav />
    </div>
  );
}
