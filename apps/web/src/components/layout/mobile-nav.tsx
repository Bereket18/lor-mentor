"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Layers,
  BookOpen,
  Bot,
  GraduationCap,
  MessageSquare,
  BarChart3,
  HeartPulse,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

// Six compact student items fit on current phones; admins/teachers get the
// sections they actually use. This used to be student-only for every role,
// which meant admins/teachers tapped a link and got bounced straight back home.
const studentNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/courses", icon: BookOpen, label: "Courses" },
  { href: "/anatomy", icon: HeartPulse, label: "Anatomy" },
  { href: "/ai-tutor", icon: Bot, label: "AI" },
  { href: "/quiz", icon: GraduationCap, label: "Quiz" },
  { href: "/profile", icon: User, label: "Profile" },
];

const adminNav = [
  { href: "/admin", icon: LayoutDashboard, label: "Overview" },
  { href: "/admin/users", icon: Users, label: "Users" },
  { href: "/admin/payments", icon: CreditCard, label: "Payments" },
  { href: "/admin/courses", icon: BookOpen, label: "Courses" },
  { href: "/anatomy", icon: HeartPulse, label: "Anatomy" },
  { href: "/admin/plans", icon: Layers, label: "Plans" },
];

const teacherNav = [
  { href: "/teacher", icon: LayoutDashboard, label: "Home" },
  { href: "/teacher/courses", icon: BookOpen, label: "Courses" },
  { href: "/anatomy", icon: HeartPulse, label: "Anatomy" },
  { href: "/forum", icon: MessageSquare, label: "Forum" },
  { href: "/teacher/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function MobileNav() {
  const pathname = usePathname();
  const { isAdmin, isTeacher } = useAuth();
  const items = isAdmin ? adminNav : isTeacher ? teacherNav : studentNav;

  return (
    <nav
      className="
      lg:hidden
      fixed bottom-0 left-0 right-0 z-50
      flex items-center
      h-16 px-2
      safe-area-inset-bottom
    "
      style={{
        background: "var(--glass-bg)",
        borderTop: "1px solid var(--glass-border)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
      }}
    >
      {items.map((item) => {
        const isActive =
          item.href === "/admin" || item.href === "/dashboard" || item.href === "/teacher"
            ? pathname === item.href
            : pathname.startsWith(item.href);

        return (
          <Link key={item.href} href={item.href} className="flex-1">
            <div
              className="flex flex-col items-center justify-center gap-1 py-2 rounded-xl transition-colors"
              style={{ color: isActive ? "var(--teal)" : "var(--text-secondary)" }}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
