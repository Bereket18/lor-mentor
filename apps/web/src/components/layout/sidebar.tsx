"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  Bot,
  CreditCard,
  MessageSquare,
  BarChart3,
  User,
  Bell,
  LogOut,
  GraduationCap,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

// ── Navigation items per role ─────────────────────────────────
const studentNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/courses", icon: BookOpen, label: "My Courses" },
  { href: "/ai-tutor", icon: Bot, label: "AI Tutor" },
  { href: "/flashcards", icon: Layers, label: "Flashcards" },
  { href: "/quiz", icon: GraduationCap, label: "Quizzes" },
  { href: "/forum", icon: MessageSquare, label: "Forum" },
  { href: "/progress", icon: BarChart3, label: "Progress" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
];

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/users", icon: User, label: "Users" },
  { href: "/admin/payments", icon: CreditCard, label: "Payments" },
  { href: "/admin/plans", icon: CreditCard, label: "Plans" },
  { href: "/admin/courses", icon: BookOpen, label: "Courses" },
  { href: "/admin/audit", icon: BarChart3, label: "Audit Logs" },
];

const teacherNav = [
  { href: "/teacher", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/teacher/courses", icon: BookOpen, label: "My Courses" },
  { href: "/teacher/analytics", icon: BarChart3, label: "Analytics" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isAdmin, isTeacher } = useAuth();

  // Pick the right nav items based on role
  const navItems = isAdmin ? adminNav : isTeacher ? teacherNav : studentNav;

  return (
    <aside
      className="
      w-56 flex-shrink-0
      bg-brand-800
      flex flex-col
      h-screen sticky top-0
      overflow-y-auto
    "
    >
      {/* ── Logo ─────────────────────────────────────── */}
      <div className="px-4 py-5 border-b border-brand-750">
        <div
          className="bg-brand-700 rounded-lg px-3 py-2
          inline-block mb-1"
        >
          <span className="text-white font-bold text-sm tracking-wide">
            LOR MENTOR
          </span>
        </div>
        <p className="text-brand-400 text-[10px] font-medium">
          Lorcan Medical College
        </p>
      </div>

      {/* ── Navigation ───────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: 2 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg",
                  "text-sm font-medium transition-colors duration-150",
                  "cursor-pointer select-none",
                  isActive
                    ? "bg-brand-700 text-white"
                    : "text-brand-300 hover:bg-brand-750 hover:text-white",
                )}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <motion.div
                    layoutId="activeBar"
                    className="absolute left-0 w-0.5 h-6 bg-brand-400 rounded-r"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* ── Divider ──────────────────────────────────── */}
      <div className="mx-4 border-t border-brand-750" />

      {/* ── User section ─────────────────────────────── */}
      <div className="px-3 py-4 space-y-0.5">
        <Link href="/profile">
          <div
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg",
              "text-sm font-medium cursor-pointer transition-colors",
              pathname === "/profile"
                ? "bg-brand-700 text-white"
                : "text-brand-300 hover:bg-brand-750 hover:text-white",
            )}
          >
            <User className="h-4 w-4 flex-shrink-0" />
            <span>Profile</span>
          </div>
        </Link>

        {/* Logout button */}
        <button
          onClick={logout}
          className="
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-sm font-medium cursor-pointer transition-colors
            text-brand-300 hover:bg-red-900/30 hover:text-red-400
          "
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span>Log out</span>
        </button>
      </div>

      {/* ── User info at bottom ───────────────────────── */}
      <div className="px-4 py-3 border-t border-brand-750">
        <p className="text-white text-xs font-medium truncate">
          {user?.fullName}
        </p>
        <p className="text-brand-400 text-[10px] truncate">{user?.email}</p>
        <span
          className="
          inline-block mt-1 px-2 py-0.5
          bg-brand-700 text-brand-200
          text-[10px] font-medium rounded-full
        "
        >
          {user?.role}
        </span>
      </div>
    </aside>
  );
}
