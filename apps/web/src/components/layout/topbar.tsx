"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";

const pageTitles: Record<string, string> = {
  "/dashboard":        "Dashboard",
  "/courses":          "My Courses",
  "/ai-tutor":         "AI Tutor",
  "/anatomy":          "Anatomy Lab",
  "/flashcards":       "Flashcards",
  "/quiz":             "Quizzes",
  "/forum":            "Forum",
  "/progress":         "Progress",
  "/notifications":    "Notifications",
  "/profile":          "Profile",
  "/admin":            "Admin Overview",
  "/admin/users":      "User Management",
  "/admin/payments":   "Payment Approvals",
  "/admin/plans":      "Subscription Plans",
  "/admin/courses":    "Academic Structure",
  "/admin/audit":      "Audit Logs",
  "/teacher":          "Teacher Dashboard",
  "/teacher/courses":  "My Courses",
  "/teacher/analytics":"Analytics",
};

interface TopbarProps {
  onMenuToggle?: () => void;
  drawerOpen?: boolean;
}

export function Topbar({ onMenuToggle, drawerOpen = false }: TopbarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

<<<<<<< HEAD
  // Close the account menu on navigation. This adjusts state during render
  // rather than in an effect: an effect would commit the new route with the
  // menu still open and only close it on a second pass, and calling setState
  // synchronously in an effect body is what `react-hooks/set-state-in-effect`
  // flags. Comparing against the last route this state was reconciled with —
  // rather than just "did the pathname change" — also stops the menu popping
  // back open if the user navigates away and returns to the same route.
  const [menuRoute, setMenuRoute] = useState(pathname);
  if (menuRoute !== pathname) {
    setMenuRoute(pathname);
    setMenuOpen(false);
  }

  // Close it on an outside click or Escape.
=======
  // Close the account menu on navigation or on an outside click / Escape.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMenuOpen(false), [pathname]);
>>>>>>> origin/main
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const title =
    pageTitles[pathname] ??
    (pathname.startsWith("/anatomy/") ? "Anatomy Lab" : "Lor Mentor");

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  return (
    <header
      className="h-14 flex-shrink-0 flex items-center justify-between px-5 sticky top-0 z-40"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        borderBottom: "1px solid var(--glass-border)",
        boxShadow: "0 1px 0 var(--teal-glow)",
      }}
    >
      {/* -- Left --------------------------------------- */}
      <div className="flex min-w-0 items-center gap-2">
        {/* The full sidebar is desktop-only; on phones this opens it as a
            drawer so every admin/teacher section stays reachable. */}
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls="mobile-navigation"
            className="lg:hidden -ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "var(--teal-dim)";
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "";
              (e.currentTarget as HTMLElement).style.color =
                "var(--text-secondary)";
            }}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <h1
          className="truncate text-sm font-semibold tracking-wide"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
      </div>

      {/* -- Right -------------------------------------- */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {/* Theme toggle — pill variant from shared component */}
        <ThemeToggle variant="pill" />

        {/* Notifications — live unread count, links to /notifications */}
        <NotificationBell />

        {/* Avatar + account menu. The sidebar is desktop-only, so this is
            the phone's route to Profile and Log out. */}
        <div ref={menuRef} className="relative ml-1">
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              "text-white text-xs font-bold cursor-pointer select-none",
            )}
            style={{
              background: "linear-gradient(135deg, #147878 0%, #1A9494 100%)",
              boxShadow: "0 0 12px rgba(45,212,191,0.3)",
            }}
          >
            {user?.fullName ? getInitials(user.fullName) : "?"}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-10 z-50 w-56 rounded-xl border p-1.5 shadow-2xl"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--glass-border)",
              }}
            >
              <div className="px-3 py-2">
                <p className="text-xs font-semibold text-primary truncate">
                  {user?.fullName}
                </p>
                <p className="text-[11px] text-muted truncate">{user?.email}</p>
              </div>
              <Link
                href="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-[var(--teal-dim)] transition-colors"
              >
                <UserIcon className="h-4 w-4" />
                Profile
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-secondary hover:text-primary hover:bg-[var(--teal-dim)] transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
