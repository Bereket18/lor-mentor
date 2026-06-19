"use client";

import Link from "next/link";
import { Users, CreditCard, BookOpen, Layers } from "lucide-react";

const cards = [
  {
    href: "/admin/users",
    icon: Users,
    title: "Users",
    description: "Manage students, teachers, and staff accounts",
  },
  {
    href: "/admin/plans",
    icon: Layers,
    title: "Plans",
    description: "Create and manage subscription plans",
  },
  {
    href: "/admin/payments",
    icon: CreditCard,
    title: "Payments",
    description: "Review receipt uploads and approve subscriptions",
  },
  {
    href: "/admin/courses",
    icon: BookOpen,
    title: "Academic Structure",
    description: "Departments, years, semesters, courses, and materials",
  },
];

export default function AdminOverviewPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary mb-1">
          Admin Overview
        </h1>
        <p className="text-sm text-secondary">
          Manage Lor Mentor platform settings and content
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="bg-surface border border-default rounded-2xl p-5
              hover:border-accent/40 transition-colors group"
          >
            <card.icon className="h-5 w-5 text-accent mb-3" />
            <h2 className="text-sm font-semibold text-primary mb-1 group-hover:text-accent transition-colors">
              {card.title}
            </h2>
            <p className="text-xs text-secondary leading-relaxed">
              {card.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
