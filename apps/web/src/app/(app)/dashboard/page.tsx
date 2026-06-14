"use client";

import { motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  Flame,
  Target,
  ArrowRight,
  Zap,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { cn } from '@/lib/utils';

// ── Animation helpers ─────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07 },
  },
};

// ── KPI Card ─────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <motion.div variants={fadeUp} className="card">
      <div className={cn("flex items-center gap-3 mb-3")}>
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            "bg-accent/10",
          )}
        >
          <Icon className="h-4 w-4 text-accent" />
        </div>
        <span
          className="text-xs font-medium text-muted uppercase
          tracking-wider"
        >
          {label}
        </span>
      </div>
      <p className={cn("text-3xl font-bold", color)}>{value}</p>
    </motion.div>
  );
}

// ── Course Progress Row ────────────────────────────────────────
function CourseRow({
  title,
  teacher,
  progress,
}: {
  title: string;
  teacher: string;
  progress: number;
}) {
  return (
    <div
      className="flex items-center gap-4 py-3
      border-b border-border last:border-0"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary truncate">{title}</p>
        <p className="text-xs text-muted">{teacher}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-24">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <span
          className="text-xs font-medium text-accent w-8
          text-right"
        >
          {progress}%
        </span>
      </div>
    </div>
  );
}

// ── Dashboard Page ────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();

  // Get first name for the greeting
  const firstName = user?.fullName?.split(" ")[0] ?? "Student";

  // Greeting based on time of day
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="max-w-6xl mx-auto space-y-6"
    >
      {/* ── Header ───────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="flex items-start justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-primary">
            {greeting}, {firstName} 👋
          </h2>
          <p className="text-secondary text-sm mt-1">
            Ready to study? Your AI tools are waiting.
          </p>
        </div>

        {/* Streak badge */}
        <div
          className="
          flex items-center gap-2 px-4 py-2
          bg-[#FFFBEB] dark:bg-[#1A1400]
          border border-[#FDE68A] dark:border-[#2A2000]
          rounded-xl
        "
        >
          <Flame className="h-4 w-4 text-orange-500" />
          <span
            className="text-sm font-semibold
            text-orange-700 dark:text-yellow-400"
          >
            5-day streak
          </span>
        </div>
      </motion.div>

      {/* ── KPI Cards ────────────────────────────────── */}
      <motion.div
        variants={container}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <KpiCard
          label="Courses"
          value="12"
          color="text-accent"
          icon={BookOpen}
        />
        <KpiCard
          label="Quizzes taken"
          value="47"
          color="text-ai"
          icon={Brain}
        />
        <KpiCard
          label="Cards reviewed"
          value="234"
          color="text-accent"
          icon={Zap}
        />
        <KpiCard
          label="Study hours"
          value="38h"
          color="text-secondary"
          icon={Clock}
        />
      </motion.div>

      {/* ── Main grid ────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Continue studying — takes 2 columns */}
        <motion.div variants={fadeUp} className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-primary">Continue studying</h3>
            <Link
              href="/courses"
              className="text-xs text-accent hover:underline
                flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Placeholder courses — will use real data in Sprint 3 */}
          <CourseRow
            title="Human Anatomy I"
            teacher="Dr. Aisha Mohammed"
            progress={64}
          />
          <CourseRow
            title="Physiology Basics"
            teacher="Dr. Tadesse Bekele"
            progress={38}
          />
          <CourseRow
            title="Biochemistry I"
            teacher="Dr. Sara Ahmed"
            progress={22}
          />
          <CourseRow
            title="Histology"
            teacher="Dr. Mihret Tesfaye"
            progress={5}
          />

          <Link
            href="/courses"
            className="
              mt-4 flex items-center justify-center gap-2
              w-full py-2.5 rounded-xl
              border border-border
              text-sm font-medium text-secondary
              hover:border-accent hover:text-accent
              transition-all
            "
          >
            Browse all courses
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>

        {/* AI Activity panel */}
        <motion.div variants={fadeUp} className="card">
          <h3 className="font-semibold text-primary mb-4">AI activity</h3>

          <div className="space-y-3">
            {[
              {
                label: "Flashcards ready",
                sub: "Anatomy Ch.3 · 24 cards",
                time: "2 min ago",
                href: "/flashcards",
              },
              {
                label: "Quiz generated",
                sub: "Physiology: Cardiac cycle",
                time: "1 hr ago",
                href: "/quiz",
              },
              {
                label: "Summary ready",
                sub: "Biochemistry Ch.1",
                time: "3 hrs ago",
                href: "/courses",
              },
            ].map((item) => (
              <Link key={item.label} href={item.href}>
                <div
                  className="
                  flex items-start gap-3 p-3 rounded-xl
                  hover:bg-elevated transition-colors cursor-pointer
                  border border-transparent
                  hover:border-border
                "
                >
                  <div
                    className="
                    w-7 h-7 rounded-lg bg-ai/10 flex-shrink-0
                    flex items-center justify-center mt-0.5
                  "
                  >
                    <Brain className="h-3.5 w-3.5 text-ai" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">
                      {item.label}
                    </p>
                    <p className="text-xs text-muted truncate">{item.sub}</p>
                  </div>
                  <span
                    className="text-[10px] text-muted
                    flex-shrink-0 mt-0.5"
                  >
                    {item.time}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          <Link
            href="/ai-tutor"
            className="
              mt-4 flex items-center justify-center gap-2
              w-full py-2.5 rounded-xl
              bg-ai/10 border border-ai/20
              text-sm font-medium text-ai
              hover:bg-ai/20 transition-all
            "
          >
            <Brain className="h-4 w-4" />
            Open AI Tutor
          </Link>
        </motion.div>
      </div>

      {/* ── Exam readiness ───────────────────────────── */}
      <motion.div variants={fadeUp} className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" />
            <h3 className="font-semibold text-primary">
              Exam readiness — Anatomy I
            </h3>
          </div>
          <span
            className="
            px-2.5 py-1 rounded-full text-xs font-medium
            bg-accent/10 text-accent
          "
          >
            14 days to exam
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div
              className="flex justify-between text-xs
              text-muted mb-2"
            >
              <span>Overall readiness</span>
              <span className="text-accent font-semibold">64%</span>
            </div>
            <div className="progress-track h-2 rounded-full">
              <div
                className="progress-fill h-2 rounded-full"
                style={{ width: "64%" }}
              />
            </div>
          </div>
          <Link
            href="/quiz"
            className="
              flex-shrink-0 px-4 py-2
              bg-accent text-white
              rounded-xl text-sm font-semibold
              hover:bg-accent-hover transition-all
            "
          >
            Take a quiz
          </Link>
        </div>
      </motion.div>
    </motion.div>
  );
}
