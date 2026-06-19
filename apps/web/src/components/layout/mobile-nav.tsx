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
import { cn } from "@/lib/utils";

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
      border-t border-white/10
      flex items-center
      h-16 px-2
      safe-area-inset-bottom
    "
      style={{
        background: "rgba(10, 26, 26, 0.97)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {mobileNav.map((item) => {
        const isActive = pathname.startsWith(item.href);

        return (
          <Link key={item.href} href={item.href} className="flex-1">
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-1",
                "py-2 rounded-xl transition-colors",
                isActive ? "text-[#14B8A6]" : "text-white/40",
              )}
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
