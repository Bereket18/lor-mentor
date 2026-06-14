"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Sun, Moon, Menu } from "lucide-react";
import { toggleTheme, getTheme, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

// Map routes to human-readable page titles
const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/courses": "My Courses",
  "/ai-tutor": "AI Tutor",
  "/flashcards": "Flashcards",
  "/quiz": "Quizzes",
  "/forum": "Forum",
  "/progress": "Progress",
  "/notifications": "Notifications",
  "/profile": "Profile",
  "/admin": "Admin Overview",
  "/admin/users": "User Management",
  "/admin/payments": "Payment Approvals",
  "/teacher": "Teacher Dashboard",
};

interface TopbarProps {
  onMenuToggle?: () => void;
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isDark, setIsDark] = useState(getTheme() === "dark");

  // Get the page title or fall back to the path
  const title = pageTitles[pathname] ?? "Lor Mentor";

  function handleThemeToggle() {
    const next = toggleTheme();
    setIsDark(next === "dark");
  }

  // Get initials from the user's full name
  // Example: "Bereket Adamsseged" → "BA"
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
      className="
      h-14 flex-shrink-0
      bg-surface border-b border-border
      flex items-center justify-between
      px-6
      sticky top-0 z-40
    "
    >
      {/* ── Left: mobile menu + page title ───────────── */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger — hidden on desktop */}
        <button
          type="button"
          title="Toggle Menu"
          aria-label="Open main navigation menu"
          onClick={onMenuToggle}
          className="lg:hidden text-muted hover:text-primary
            transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="text-base font-semibold text-primary">{title}</h1>
      </div>

      {/* ── Right: theme toggle, notifications, avatar ─ */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={handleThemeToggle}
          className="
            w-9 h-9 rounded-lg
            flex items-center justify-center
            text-muted hover:text-primary
            hover:bg-elevated
            transition-all
          "
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications bell */}
        <button
          className="
          w-9 h-9 rounded-lg relative
          flex items-center justify-center
          text-muted hover:text-primary
          hover:bg-elevated
          transition-all
        "
        >
          <Bell className="h-4 w-4" />
          {/* Unread badge — we will wire this up in Sprint 9 */}
          <span
            className="
            absolute top-1.5 right-1.5
            w-2 h-2 rounded-full
            bg-error
          "
          />
        </button>

        {/* User avatar */}
        <div
          className="
          w-8 h-8 rounded-full
          bg-accent
          flex items-center justify-center
          text-white text-xs font-bold
          cursor-pointer
          ml-1
        "
        >
          {user?.fullName ? getInitials(user.fullName) : "?"}
        </div>
      </div>
    </header>
  );
}
