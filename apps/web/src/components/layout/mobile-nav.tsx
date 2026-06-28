"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Bot,
  GraduationCap,
  User,
} from "lucide-react";

// Only 5 items fit on mobile bottom nav
// We pick the most important ones
const mobileNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/courses", icon: BookOpen, label: "Courses" },
  { href: "/ai-tutor", icon: Bot, label: "AI" },
  { href: "/quiz", icon: GraduationCap, label: "Quiz" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function MobileNav() {
  const pathname = usePathname();

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
      {mobileNav.map((item) => {
        const isActive = pathname.startsWith(item.href);

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
