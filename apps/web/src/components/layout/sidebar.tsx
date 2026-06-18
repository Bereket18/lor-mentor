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

const studentNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/courses",   icon: BookOpen,        label: "My Courses" },
  { href: "/ai-tutor",  icon: Bot,             label: "AI Tutor" },
  { href: "/flashcards",icon: Layers,          label: "Flashcards" },
  { href: "/quiz",      icon: GraduationCap,   label: "Quizzes" },
  { href: "/forum",     icon: MessageSquare,   label: "Forum" },
  { href: "/progress",  icon: BarChart3,       label: "Progress" },
  { href: "/notifications", icon: Bell,        label: "Notifications" },
];

const adminNav = [
  { href: "/admin",          icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/users",    icon: User,            label: "Users" },
  { href: "/admin/payments", icon: CreditCard,      label: "Payments" },
  { href: "/admin/courses",  icon: BookOpen,        label: "Courses" },
  { href: "/admin/audit",    icon: BarChart3,       label: "Audit Logs" },
];

const teacherNav = [
  { href: "/teacher",           icon: LayoutDashboard, label: "Dashboard" },
  { href: "/teacher/courses",   icon: BookOpen,        label: "My Courses" },
  { href: "/teacher/analytics", icon: BarChart3,       label: "Analytics" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, isAdmin, isTeacher } = useAuth();

  const navItems = isAdmin ? adminNav : isTeacher ? teacherNav : studentNav;

  return (
    <aside
      // Sidebar is always the Lorcan dark-teal regardless of light/dark mode
      style={{ backgroundColor: "#0A1A1A" }}
      className="w-56 flex-shrink-0 flex flex-col h-screen sticky top-0 overflow-y-auto"
    >
      {/* ── Logo ───────────────────────────────────────────────── */}
      <div
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        className="px-4 py-5"
      >
        {/* Badge with Lorcan teal background */}
        <div
          style={{ backgroundColor: "#147878" }}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 mb-1.5"
        >
          {/* Teal dot — the Lorcan "L" accent */}
          <div
            style={{ backgroundColor: "#2DD4BF" }}
            className="w-2 h-2 rounded-full flex-shrink-0"
          />
          <span className="text-white font-bold text-sm tracking-wide">
            LOR MENTOR
          </span>
        </div>
        <p style={{ color: "#78AAAE" }} className="text-[10px] font-medium">
          Lorcan Medical College
        </p>
      </div>

      {/* ── Navigation ─────────────────────────────────────────── */}
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
                style={
                  isActive
                    ? { backgroundColor: "#147878", color: "#FFFFFF" }
                    : { color: "#9EC4C7" }
                }
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg",
                  "text-sm font-medium transition-colors duration-150",
                  "cursor-pointer select-none",
                  !isActive && "hover:bg-white/5 hover:text-white",
                )}
              >
                {/* Active left-bar indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeBar"
                    style={{ backgroundColor: "#2DD4BF" }}
                    className="absolute left-0 w-0.5 h-6 rounded-r"
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

      {/* ── Divider ────────────────────────────────────────────── */}
      <div
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
        className="mx-4 border-t"
      />

      {/* ── Profile & Logout ───────────────────────────────────── */}
      <div className="px-3 py-4 space-y-0.5">
        <Link href="/profile">
          <div
            style={
              pathname === "/profile"
                ? { backgroundColor: "#147878", color: "#FFFFFF" }
                : { color: "#9EC4C7" }
            }
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg",
              "text-sm font-medium cursor-pointer transition-colors",
              pathname !== "/profile" && "hover:bg-white/5 hover:text-white",
            )}
          >
            <User className="h-4 w-4 flex-shrink-0" />
            <span>Profile</span>
          </div>
        </Link>

        <button
          onClick={logout}
          style={{ color: "#9EC4C7" }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
            text-sm font-medium cursor-pointer transition-colors
            hover:bg-red-900/30 hover:text-red-400"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span>Log out</span>
        </button>
      </div>

      {/* ── User info ──────────────────────────────────────────── */}
      <div
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
        className="px-4 py-3 border-t"
      >
        <p className="text-white text-xs font-medium truncate">
          {user?.fullName}
        </p>
        <p style={{ color: "#78AAAE" }} className="text-[10px] truncate">
          {user?.email}
        </p>
        <span
          style={{ backgroundColor: "#147878", color: "#B8D8DA" }}
          className="inline-block mt-1 px-2 py-0.5 text-[10px] font-medium rounded-full"
        >
          {user?.role}
        </span>
      </div>
    </aside>
  );
}
