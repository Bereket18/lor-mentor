"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, BookOpen, Bot, CreditCard, MessageSquare,
  BarChart3, User, Bell, LogOut, GraduationCap, Layers,
  ChevronLeft, ChevronRight, ShieldAlert,
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
  { href: "/admin",            icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/users",      icon: User,            label: "Users" },
  { href: "/admin/payments",   icon: CreditCard,      label: "Payments" },
  { href: "/admin/plans",      icon: CreditCard,      label: "Plans" },
  { href: "/admin/courses",    icon: BookOpen,        label: "Courses" },
  { href: "/admin/moderation", icon: ShieldAlert,     label: "Moderation" },
  { href: "/admin/audit",      icon: BarChart3,       label: "Audit Logs" },
];

const teacherNav = [
  { href: "/teacher",           icon: LayoutDashboard, label: "Dashboard" },
  { href: "/teacher/courses",   icon: BookOpen,        label: "My Courses" },
  { href: "/forum",             icon: MessageSquare,   label: "Forum" },
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
        background: "var(--glass-bg)",
        borderRight: "1px solid var(--glass-border)",
        boxShadow: "inset -1px 0 0 var(--teal-glow), 4px 0 32px rgba(0,0,0,0.25)",
      }}
    >
      {/* -- Chromatic top glow -------------------------------- */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-48"
        style={{
          background: "radial-gradient(ellipse 120% 60% at 50% 0%, var(--teal-glow) 0%, transparent 100%)",
          opacity: 0.5,
        }}
      />
      {/* Subtle right-edge highlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-px"
        style={{
          background: "linear-gradient(180deg, var(--teal-glow) 0%, transparent 100%)",
        }}
      />

      {/* -- Logo ---------------------------------------------- */}
      <div
        className={cn(
          "relative z-10 flex items-center flex-shrink-0",
          collapsed ? "px-3 py-5 justify-center" : "px-4 py-5",
        )}
        style={{ borderBottom: "1px solid var(--glass-border)" }}
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
                boxShadow: "0 0 16px var(--teal-glow), inset 0 1px 0 rgba(255,255,255,0.15)",
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
                  boxShadow: "0 0 16px var(--teal-glow), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <span className="text-white font-bold text-sm">L</span>
              </div>
              <div className="min-w-0">
                <p
                  className="font-bold text-sm tracking-wide leading-none whitespace-nowrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  LOR MENTOR
                </p>
                <p
                  className="text-[10px] font-medium mt-0.5 whitespace-nowrap"
                  style={{ color: "var(--teal)" }}
                >
                  Lorcan Medical College
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* -- Navigation ---------------------------------------- */}
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
                        background: "var(--teal-dim)",
                        color: "var(--teal)",
                        boxShadow: "inset 0 0 0 1px var(--teal-glow), 0 0 16px var(--teal-glow)",
                      }
                    : { color: "var(--text-secondary)" }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "var(--teal-dim)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                  }
                }}
              >
                {/* Active left accent line */}
                {isActive && !collapsed && (
                  <motion.div
                    layoutId="activeBar"
                    className="absolute left-0 w-0.5 h-5 rounded-r"
                    style={{ background: "linear-gradient(180deg, var(--teal-hover), var(--teal))" }}
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

      {/* -- Divider ------------------------------------------- */}
      <div
        className="relative z-10 mx-3"
        style={{ borderTop: "1px solid var(--glass-border)" }}
      />

      {/* -- Profile & Logout ---------------------------------- */}
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
                    background: "var(--teal-dim)",
                    color: "var(--teal)",
                    boxShadow: "inset 0 0 0 1px var(--teal-glow)",
                  }
                : { color: "var(--text-secondary)" }
            }
            onMouseEnter={(e) => {
              if (pathname !== "/profile") {
                (e.currentTarget as HTMLElement).style.background = "var(--teal-dim)";
                (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (pathname !== "/profile") {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
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
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)";
            (e.currentTarget as HTMLElement).style.color = "var(--state-error)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
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

      {/* -- User info glass card ------------------------------- */}
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
              background: "var(--bg-glass)",
              border: "1px solid var(--glass-border)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
            }}
          >
            {/* Top chromatic arc on card */}
            <div
              aria-hidden
              className="absolute top-0 left-0 right-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent, var(--teal), transparent)",
                opacity: 0.5,
              }}
            />
            <p
              className="text-xs font-semibold truncate leading-none mb-0.5"
              style={{ color: "var(--text-primary)" }}
            >
              {user?.fullName}
            </p>
            <p className="text-[10px] truncate mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {user?.email}
            </p>
            <span
              className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: "var(--teal-dim)",
                color: "var(--teal)",
                border: "1px solid var(--teal-glow)",
              }}
            >
              {user?.role}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* -- Collapse toggle ------------------------------------ */}
      <div
        className="relative z-10 p-2"
        style={{ borderTop: "1px solid var(--glass-border)" }}
      >
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-full flex items-center justify-center py-2 rounded-xl transition-all duration-150"
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
