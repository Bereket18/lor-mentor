"use client";

import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const pageTitles: Record<string, string> = {
  "/dashboard":        "Dashboard",
  "/courses":          "My Courses",
  "/ai-tutor":         "AI Tutor",
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
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname();
  const { user }  = useAuth();

  const title = pageTitles[pathname] ?? "Lor Mentor";

  function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
  }

  return (
    <header
      className="h-14 flex-shrink-0 flex items-center justify-between px-5 sticky top-0 z-40"
      style={{
        background: "rgba(8, 20, 20, 0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(45,212,191,0.1)",
        boxShadow: "0 1px 0 rgba(45,212,191,0.05)",
      }}
    >
      {/* ── Left ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Open navigation menu"
          onClick={onMenuToggle}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: "rgba(255,255,255,0.5)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
            (e.currentTarget as HTMLElement).style.background = "";
          }}
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1
          className="text-sm font-semibold tracking-wide"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {title}
        </h1>
      </div>

      {/* ── Right ────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {/* Theme toggle — pill variant from shared component */}
        <ThemeToggle variant="pill" />

        {/* Notifications */}
        <button
          aria-label="Notifications"
          className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-all"
          style={{ color: "rgba(255,255,255,0.5)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.9)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)";
          }}
        >
          <Bell className="h-4 w-4" />
          <span
            className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full"
            style={{ background: "#EF4444" }}
          />
        </button>

        {/* Avatar */}
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            "text-white text-xs font-bold cursor-pointer ml-1 select-none",
          )}
          style={{
            background: "linear-gradient(135deg, #147878 0%, #1A9494 100%)",
            boxShadow: "0 0 12px rgba(45,212,191,0.3)",
          }}
        >
          {user?.fullName ? getInitials(user.fullName) : "?"}
        </div>
      </div>
    </header>
  );
}
