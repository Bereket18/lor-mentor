"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  MessageSquare,
  SquareStack as CardsIcon,
  FileText,
  Flame,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

// ── Animation helpers ───────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  },
};

// ── Placeholder data — real data comes in Sprint 3 ───────────────
const continueCourse = {
  title: "Human Anatomy I",
  chapter: "Chapter 3 · Brachial Plexus",
  progress: 64,
  timeLeft: "12 min left in this chapter",
};

const enrolledCourses = [
  { title: "Human Anatomy I", teacher: "Dr. Aisha Mohammed", progress: 64 },
  { title: "Physiology Basics", teacher: "Dr. Tadesse Bekele", progress: 38 },
  { title: "Biochemistry I", teacher: "Dr. Sara Ahmed", progress: 22 },
];

const recommendedCourses = [
  {
    title: "Histology",
    teacher: "Dr. Mihret Tesfaye",
    reason: "Next in your semester",
  },
];

const recentActivity = [
  { label: "AI flashcards ready — Anatomy Ch.3", time: "2m", color: "bg-ai" },
  { label: "Quiz generated — Cardiac cycle", time: "1h", color: "bg-accent" },
  { label: "Summary ready — Biochemistry Ch.1", time: "3h", color: "bg-teal" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName?.split(" ")[0] ?? "Student";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      {/* ── Minimal header — no card, just typography ───────── */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        className="flex items-center justify-between"
      >
        <h1 className="font-display text-2xl font-semibold text-primary">
          {greeting}, {firstName}
        </h1>
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <Flame className="h-3.5 w-3.5 text-warning" />
          <span>5-day streak</span>
        </div>
      </motion.div>

      {/* ── SECTION 1: Continue Learning — Hero ─────────────── */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={{ delay: 0.05 }}
      >
        <p className="text-xs font-medium text-muted tracking-wide mb-3">
          CONTINUE LEARNING
        </p>
        <Link href="/courses">
          <div
            className={cn(
              "relative rounded-2xl p-8 overflow-hidden",
              "bg-surface border border-default",
              "hover:border-accent/30 transition-all duration-200 group",
            )}
          >
            {/* Subtle ambient glow */}
            <div
              className="absolute -top-12 -right-12 w-48 h-48
              bg-accent/[0.08] rounded-full blur-3xl"
            />

            <div className="relative z-10">
              <h2
                className="font-display text-xl font-semibold
                text-primary mb-1"
              >
                {continueCourse.title}
              </h2>
              <p className="text-sm text-secondary mb-6">
                {continueCourse.chapter}
              </p>

              <div className="mb-5 max-w-xs">
                <div className="progress-track h-1.5">
                  <div
                    className="progress-fill h-1.5"
                    style={{ width: `${continueCourse.progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted mt-2">
                  {continueCourse.progress}% complete
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2.5",
                    "bg-accent text-white rounded-xl text-sm font-medium",
                    "group-hover:bg-accent-hover transition-colors",
                  )}
                >
                  Resume
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform
                    group-hover:translate-x-0.5"
                  />
                </span>
                <span className="text-xs text-muted">
                  {continueCourse.timeLeft}
                </span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* ── SECTION 2: AI Study Assistant ───────────────────── */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={{ delay: 0.1 }}
      >
        <Link href="/ai-tutor">
          <div
            className={cn(
              "relative rounded-2xl px-6 py-5 overflow-hidden",
              "bg-ai-dim border border-ai/20",
              "hover:border-ai/40 transition-all duration-200 group",
            )}
          >
            <div
              className="absolute inset-0 bg-gradient-to-r
              from-ai/[0.03] to-transparent"
            />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl bg-ai/15
                  flex items-center justify-center flex-shrink-0
                  animate-pulse-glow"
                >
                  <Sparkles className="h-4 w-4 text-ai" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">
                    AI Study Assistant
                  </p>
                  <p className="text-xs text-secondary truncate">
                    Ask me about the brachial plexus, or anything in your
                    courses.
                  </p>
                </div>
              </div>
              <span
                className="flex-shrink-0 text-xs font-medium
                text-ai flex items-center gap-1
                group-hover:gap-2 transition-all"
              >
                Ask
                <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* ── SECTION 3: My Courses ────────────────────────────── */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={{ delay: 0.15 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-primary">My Courses</h2>
          <Link
            href="/courses"
            className="text-xs text-accent hover:text-accent-hover
              flex items-center gap-1 transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="space-y-0">
          {enrolledCourses.map((course, i) => (
            <Link key={course.title} href="/courses">
              <div
                className={cn(
                  "flex items-center gap-4 py-3.5 px-2 -mx-2 rounded-lg",
                  "hover:bg-elevated transition-colors duration-150",
                  i < enrolledCourses.length - 1 && "border-b border-subtle",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary truncate">
                    {course.title}
                  </p>
                  <p className="text-xs text-muted">{course.teacher}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="w-20 progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${course.progress}%` }}
                    />
                  </div>
                  <span
                    className="text-xs font-medium text-secondary
                    w-8 text-right"
                  >
                    {course.progress}%
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {/* Recommended — visually distinct, lighter weight */}
          {recommendedCourses.map((course) => (
            <Link key={course.title} href="/courses">
              <div
                className="flex items-center gap-4 py-3.5 px-2 -mx-2
                rounded-lg hover:bg-elevated transition-colors duration-150
                border-t border-subtle mt-1"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-secondary truncate">
                      {course.title}
                    </p>
                    <span
                      className="text-[10px] font-medium text-teal
                      bg-teal-dim px-2 py-0.5 rounded-full"
                    >
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-muted">{course.reason}</p>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted flex-shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── SECTION 4: Recent Activity ──────────────────────── */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-sm font-semibold text-primary mb-4">
          Recent Activity
        </h2>
        <div className="space-y-3">
          {recentActivity.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div
                className={cn(
                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                  item.color,
                )}
              />
              <p className="text-sm text-secondary flex-1">{item.label}</p>
              <span className="text-xs text-muted">{item.time}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── SECTION 5: Community Highlights — single line ──── */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={{ delay: 0.25 }}
      >
        <Link href="/forum">
          <div
            className="flex items-center gap-2.5 py-3 px-4 -mx-4
            rounded-xl hover:bg-elevated transition-colors group"
          >
            <MessageSquare className="h-3.5 w-3.5 text-muted flex-shrink-0" />
            <p className="text-sm text-secondary flex-1">
              12 new replies in Anatomy I forum this week
            </p>
            <ArrowRight
              className="h-3.5 w-3.5 text-muted
              group-hover:translate-x-0.5 transition-transform"
            />
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
