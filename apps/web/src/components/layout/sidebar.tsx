"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, BookOpen, Bot, CreditCard, MessageSquare,
  BarChart3, User, Bell, LogOut, GraduationCap, Layers,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const studentNav = [
  { href: "/dashboard",     icon: LayoutDashboard, label: "Dashboard" },
  { href: "/courses",       icon: BookOpen,        label: "My Courses" },
  { href: "/ai-tutor",      icon: Bot,             label: "AI Tutor" },
  { href: "/flashcards",    icon: Layers,          label: "Flashcards" },
  { href: "/quiz",          icon: GraduationCap,   label: "Quizzes" },
  { href: "/forum",         icon: MessageSquare,   label: "Forum" },
  { href: "/progress",      icon: BarChart3,       label: "Progress" },
  { href: "/notifications", icon: Bell,            label: "Notifications" },
];

const adminNav = [
  { href: "/admin",          icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/users",    icon: User,            label: "Users" },
  { href: "/admin/payments", icon: CreditCard,      label: "Payments" },
  { href: "/admin/plans",    icon: CreditCard,      label: "Plans" },
  { href: "/admin/courses",  icon: BookOpen,        label: "Courses" },
  { href: "/admin/audit",    icon: BarChart3,       label: "Audit Logs" },
];

const teacherNav = [
  { href: "/teacher",           icon: LayoutDashboard, label: "Dashboard" },
  { href: "/teacher/courses",   icon: BookOpen,        label: "My Courses" },
  { href: "/teacher/analytics", icon: BarChart3,       label: "Analytics" },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname  = usePathname();
  const { user, logout, isAdmin, isTeacher } = useAuth();
  const navItems  = isAdmin ? adminNav : isTeacher ? teacherNav : studentNav;

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 224 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex-shrink-0 flex flex-col h-screen sticky top-0 overflow-hidden relative"
      style={{
        backdropFilter: "blur(24px) saturate(150%)",
        WebkitBackdropFilter: "blur(24px) saturate(150%)",
        background: "rgba(6,11,20,0.88)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "inset -1px 0 0 rgba(45,212,191,0.07), 4px 0 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* ── Chromatic top glow ──────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-48"
        style={{
          background: "radial-gradient(ellipse 120% 60% at 50% 0%, rgba(45,212,191,0.07) 0%, transparent 100%)",
        }}
      />
      {/* Subtle right-edge highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-px"
        style={{
          background: "linear-gradient(180deg, rgba(45,212,191,0.15) 0%, rgba(45,212,191,0.04) 50%, transparent 100%)",
        }}
      />

      {/* ── Logo ────────────────────────────────────────────── */}
      <div
        className={cn(
          "relative z-10 flex items-center flex-shrink-0",
          collapsed ? "px-3 py-5 justify-center" : "px-4 py-5",
        )}
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div
              key="icon"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, #147878 0%, #1A9494 100%)",
                boxShadow: "0 0 16px rgba(45,212,191,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              <span className="text-white font-bold text-sm">L</span>
            </motion.div>
          ) : (
            <motion.div
              key="full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, #147878 0%, #1A9494 100%)",
                  boxShadow: "0 0 16px rgba(45,212,191,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm tracking-wide leading-none whitespace-nowrap">
                  LOR MENTOR
                </p>
                <p
                  className="text-[10px] font-medium mt-0.5 whitespace-nowrap"
                  style={{ color: "#2DD4BF", opacity: 0.65 }}
                >
                  Lorcan Medical College
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ──────────────────────────────────────── */}
      <nav className="relative z-10 flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard" || item.href === "/admin" || item.href === "/teacher"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href}>
              <motion.div
                whileHover={{ x: collapsed ? 0 : 2 }}
                transition={{ duration: 0.12 }}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex items-center rounded-xl text-sm font-medium",
                  "cursor-pointer select-none transition-all duration-150",
                  collapsed ? "px-0 py-2.5 justify-center" : "gap-3 px-3 py-2.5",
                )}
                style={
                  isActive
                    ? {
                        background: "rgba(45,212,191,0.13)",
                        color: "#2DD4BF",
                        boxShadow: "inset 0 0 0 1px rgba(45,212,191,0.18), 0 0 16px rgba(45,212,191,0.12)",
                      }
                    : { color: "rgba(255,255,255,0.42)" }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "rgba(45,212,191,0.06)";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.82)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.42)";
                  }
                }}
              >
                {/* Active left accent line */}
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="activeBar"
                    className="absolute left-0 w-0.5 h-5 rounded-r"
                    style={{ background: "linear-gradient(180deg, #2DD4BF, #14B8A6)" }}
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

      {/* ── Divider ─────────────────────────────────────────── */}
      <div
        className="relative z-10 mx-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      />

      {/* ── Profile & Logout ────────────────────────────────── */}
      <div className="relative z-10 px-2 py-2 space-y-0.5">
        {/* Profile */}
        <Link href="/profile">
          <div
            title={collapsed ? "Profile" : undefined}
            className={cn(
              "flex items-center rounded-xl text-sm font-medium cursor-pointer transition-all duration-150",
              collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
            )}
            style={
              pathname === "/profile"
                ? {
                    background: "rgba(45,212,191,0.13)",
                    color: "#2DD4BF",
                    boxShadow: "inset 0 0 0 1px rgba(45,212,191,0.18)",
                  }
                : { color: "rgba(255,255,255,0.42)" }
            }
            onMouseEnter={(e) => {
              if (pathname !== "/profile") {
                (e.currentTarget as HTMLElement).style.background = "rgba(45,212,191,0.06)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.82)";
              }
            }}
            onMouseLeave={(e) => {
              if (pathname !== "/profile") {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.42)";
              }
            }}
          >
            <User className="h-4 w-4 flex-shrink-0" />
            <AnimatePresence initial={false}>
              {!collapsed && (
                <motion.span
                  key="profile"
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

        {/* Logout */}
        <button
          onClick={logout}
          title={collapsed ? "Log out" : undefined}
          className={cn(
            "w-full flex items-center rounded-xl text-sm font-medium cursor-pointer transition-all duration-150",
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
          )}
          style={{ color: "rgba(255,255,255,0.42)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)";
            (e.currentTarget as HTMLElement).style.color = "#F87171";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.42)";
          }}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                key="logout"
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

      {/* ── User info glass card ─────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="user-info"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="relative z-10 mx-2 mb-2 px-3 py-3 rounded-2xl overflow-hidden"
            style={{
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
            }}
          >
            {/* Top chromatic arc on card */}
            <div
              aria-hidden
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(45,212,191,0.3), transparent)",
              }}
            />
            <p className="text-white text-xs font-semibold truncate leading-none mb-0.5">
              {user?.fullName}
            </p>
            <p className="text-[10px] truncate mb-1.5" style={{ color: "rgba(45,212,191,0.55)" }}>
              {user?.email}
            </p>
            <span
              className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: "rgba(45,212,191,0.12)",
                color: "#2DD4BF",
                border: "1px solid rgba(45,212,191,0.2)",
              }}
            >
              {user?.role}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapse toggle ──────────────────────────────────── */}
      <div
        className="relative z-10 p-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-full flex items-center justify-center py-2 rounded-xl transition-all duration-150"
          style={{ color: "rgba(255,255,255,0.28)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.28)";
          }}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </div>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
