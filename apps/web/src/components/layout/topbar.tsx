"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleHelp,
  LogOut,
  Menu,
  MessageSquarePlus,
  Ticket,
  User as UserIcon,
} from "lucide-react";
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
  "/support":          "Help centre",
  "/support/tickets":  "My tickets",
  "/support/new":      "New ticket",
  "/admin":            "Admin Overview",
  "/admin/users":      "User Management",
  "/admin/payments":   "Payment Approvals",
  "/admin/plans":      "Subscription Plans",
  "/admin/courses":    "Academic Structure",
  "/admin/audit":      "Audit Logs",
  "/admin/support":    "Support inbox",
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
  const [helpOpen, setHelpOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close both menus on navigation. This adjusts state during render rather
  // than in an effect: an effect would commit the new route with the menu still
  // open and only close it on a second pass, and calling setState synchronously
  // in an effect body is what `react-hooks/set-state-in-effect` flags.
  // Comparing against the last route this state was reconciled with — rather
  // than just "did the pathname change" — also stops a menu popping back open
  // if the user navigates away and returns to the same route.
  const [menuRoute, setMenuRoute] = useState(pathname);
  if (menuRoute !== pathname) {
    setMenuRoute(pathname);
    setMenuOpen(false);
    setHelpOpen(false);
  }

  // Close the open menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !helpOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuOpen && !menuRef.current?.contains(target)) setMenuOpen(false);
      if (helpOpen && !helpRef.current?.contains(target)) setHelpOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setHelpOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, helpOpen]);

  const title =
    pageTitles[pathname] ??
    (pathname.startsWith("/anatomy/")
      ? "Anatomy Lab"
      : pathname.startsWith("/support/tickets/")
        ? "Ticket"
        : pathname.startsWith("/admin/support/")
          ? "Support ticket"
          : "Lor Mentor");

  function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
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
            className="lg:hidden -ml-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--teal-dim)";
              (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "";
              (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
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
        {/* Theme toggle. On phones the full pill crowds the title at 320 px,
            so only the icon renders there; both are the same control. */}
        <div className="hidden sm:flex">
          <ThemeToggle variant="pill" />
        </div>
        <div className="flex sm:hidden">
          <ThemeToggle variant="icon" />
        </div>

        {/* Notifications — live unread count, links to /notifications */}
        <NotificationBell />

        {/* Help and support. Shared by desktop and the phone header, so the
            top bar is one place to reach the help centre from any page. */}
        <div ref={helpRef} className="relative">
          <button
            type="button"
            aria-label="Help and support"
            aria-haspopup="menu"
            aria-expanded={helpOpen}
            onClick={() => {
              setHelpOpen((open) => !open);
              setMenuOpen(false);
            }}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
              "hover:bg-[var(--teal-dim)] hover:text-[var(--text-primary)]",
            )}
            style={{ color: "var(--text-secondary)" }}
          >
            <CircleHelp className="h-5 w-5" aria-hidden="true" />
          </button>

          {helpOpen && (
            <div
              role="menu"
              aria-label="Help and support"
              className="absolute right-0 top-12 z-50 w-64 rounded-xl border p-1.5 shadow-2xl"
              style={{
                background: "var(--bg-elevated)",
                borderColor: "var(--glass-border)",
              }}
            >
              <p
                className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}
              >
                Help and support
              </p>
              <Link
                href="/support"
                role="menuitem"
                onClick={() => setHelpOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-secondary transition-colors hover:bg-[var(--teal-dim)] hover:text-primary"
              >
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
                Help centre
              </Link>
              <Link
                href="/support/tickets"
                role="menuitem"
                onClick={() => setHelpOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-secondary transition-colors hover:bg-[var(--teal-dim)] hover:text-primary"
              >
                <Ticket className="h-4 w-4" aria-hidden="true" />
                My tickets
              </Link>
              <Link
                href="/support/new"
                role="menuitem"
                onClick={() => setHelpOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-secondary transition-colors hover:bg-[var(--teal-dim)] hover:text-primary"
              >
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                New ticket
              </Link>
            </div>
          )}
        </div>

        {/* Avatar + account menu. The sidebar is desktop-only, so this is
            the phone's route to Profile and Log out. */}
        <div ref={menuRef} className="relative ml-1">
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
              setHelpOpen(false);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full cursor-pointer"
          >
            {/* 44 px target; the visible circle stays 32 px so the header does
                not grow. */}
            <span
              className="flex h-8 w-8 select-none items-center justify-center rounded-full text-xs font-bold text-white"
              style={{
                background: "linear-gradient(135deg, #147878 0%, #1A9494 100%)",
                boxShadow: "0 0 12px rgba(45,212,191,0.3)",
              }}
            >
              {user?.fullName ? getInitials(user.fullName) : "?"}
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 z-50 w-56 rounded-xl border p-1.5 shadow-2xl"
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
