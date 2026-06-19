"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  ChevronLeft,
  ChevronRight,
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

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, isAdmin, isTeacher } = useAuth();

  const navItems = isAdmin ? adminNav : isTeacher ? teacherNav : studentNav;

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="
        flex-shrink-0
        flex flex-col
        h-screen sticky top-0
        overflow-hidden
        border-r border-white/10
      "
      style={{
        background: "rgba(10, 26, 26, 0.95)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* ── Logo ─────────────────────────────────────── */}
      <div
        className={cn(
          "border-b border-white/10 flex items-center",
          collapsed ? "px-3 py-5 justify-center" : "px-4 py-5",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div
              key="icon-only"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-8 h-8 bg-[#147878] rounded-lg flex items-center justify-center flex-shrink-0"
            >
              <span className="text-white font-bold text-xs">LM</span>
            </motion.div>
          ) : (
            <motion.div
              key="full-logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="bg-[#147878]/80 rounded-lg px-3 py-2 inline-block mb-1">
                <span className="text-white font-bold text-sm tracking-wide whitespace-nowrap">
                  LOR MENTOR
                </span>
              </div>
              <p className="text-[#2DD4BF]/60 text-[10px] font-medium whitespace-nowrap">
                Lorcan Medical College
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ───────────────────────────────── */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard" || item.href === "/admin" || item.href === "/teacher"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: collapsed ? 0 : 2 }}
                transition={{ duration: 0.15 }}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex items-center rounded-lg",
                  "text-sm font-medium transition-colors duration-150",
                  "cursor-pointer select-none",
                  collapsed ? "px-0 py-2.5 justify-center" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-[#147878]/30 text-[#2DD4BF]"
                    : "text-white/50 hover:bg-white/5 hover:text-white/90",
                )}
              >
                {/* Active left bar */}
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="activeBar"
                    className="absolute left-0 w-0.5 h-5 bg-[#14B8A6] rounded-r"
                    initial={false}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* ── Divider ──────────────────────────────────── */}
      <div className="mx-3 border-t border-white/10" />

      {/* ── User section ─────────────────────────────── */}
      <div className="px-2 py-3 space-y-0.5">
        <Link href="/profile">
          <div
            title={collapsed ? "Profile" : undefined}
            className={cn(
              "flex items-center rounded-lg",
              "text-sm font-medium cursor-pointer transition-colors",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
              pathname === "/profile"
                ? "bg-[#147878]/30 text-[#2DD4BF]"
                : "text-white/50 hover:bg-white/5 hover:text-white/90",
            )}
          >
            <User className="h-4 w-4 flex-shrink-0" />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="profile-label"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden whitespace-nowrap"
                >
                  Profile
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </Link>

        <button
          onClick={logout}
          title={collapsed ? "Log out" : undefined}
          className={cn(
            "w-full flex items-center rounded-lg",
            "text-sm font-medium cursor-pointer transition-colors",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
            "text-white/50 hover:bg-red-900/30 hover:text-red-400",
          )}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="logout-label"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden whitespace-nowrap"
              >
                Log out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── User info ─────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="user-info"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="px-4 py-3 border-t border-white/10 overflow-hidden"
          >
            <p className="text-white text-xs font-medium truncate">
              {user?.fullName}
            </p>
            <p className="text-[#2DD4BF]/60 text-[10px] truncate">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-[#147878]/40 text-[#2DD4BF] text-[10px] font-medium rounded-full">
              {user?.role}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapse toggle button ────────────────────── */}
      <div className="border-t border-white/10 p-2">
        <button
          onClick={onToggle}
          className={cn(
            "w-full flex items-center justify-center",
            "py-2 rounded-lg transition-colors",
            "text-white/40 hover:bg-white/5 hover:text-white/80",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </div>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
