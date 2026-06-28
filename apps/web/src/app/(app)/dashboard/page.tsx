"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, Bot, Layers, GraduationCap, MessageSquare,
  BookOpen, CreditCard, Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import type { FullProfile } from "@/types";

interface StudentCourse {
  id: string;
  title: string;
  teacher?: { id: string; fullName: string } | null;
  semester?: { id: string; name: string } | null;
  _count?: { materials: number };
}

interface CourseProgress {
  courseId: string;
  pct: number;
  viewedMaterials: number;
  totalMaterials: number;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const studyTools = [
  { href: "/ai-tutor",   icon: Bot,           label: "AI Tutor",   desc: "Ask anything",      accent: "var(--ai-primary)", dim: "var(--ai-dim)" },
  { href: "/flashcards", icon: Layers,        label: "Flashcards", desc: "Review & memorize", accent: "var(--teal)",       dim: "var(--teal-dim)" },
  { href: "/quiz",       icon: GraduationCap, label: "Quizzes",    desc: "Test yourself",     accent: "var(--accent-primary)", dim: "var(--accent-dim)" },
  { href: "/forum",      icon: MessageSquare, label: "Forum",      desc: "Discuss with peers", accent: "var(--teal)",      dim: "var(--teal-dim)" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [progress, setProgress] = useState<Record<string, CourseProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      api.get<StudentCourse[]>("/courses/my-year"),
      api.get<{ user: FullProfile }>("/users/me/full"),
      api.get<{ courses: CourseProgress[] }>("/progress/me"),
    ]).then(([c, p, pr]) => {
      if (!active) return;
      if (c.status === "fulfilled") setCourses(c.value.data ?? []);
      if (p.status === "fulfilled") setProfile(p.value.data.user);
      if (pr.status === "fulfilled") {
        const map: Record<string, CourseProgress> = {};
        (pr.value.data.courses ?? []).forEach((cp) => { map[cp.courseId] = cp; });
        setProgress(map);
      }
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const firstName = user?.fullName?.split(" ")[0] ?? "Student";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const subActive = profile?.subscription?.status === "ACTIVE";

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* ── Header ──────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <h1 className="font-display text-2xl font-semibold text-primary">
          {greeting}, {firstName}
        </h1>
        <p className="text-secondary text-sm mt-1">
          {profile?.department?.name
            ? `${profile.department.name}${profile.academicYear?.label ? ` · ${profile.academicYear.label}` : ""}`
            : "Welcome back to Lor Mentor."}
        </p>
      </motion.div>

      {/* ── Subscription banner (only when not active) ──────── */}
      {!loading && !subActive && (
        <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.05 }}>
          <Link href="/pricing">
            <div className="glass-panel glass-panel-hover p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--teal-dim)" }}>
                <CreditCard className="h-5 w-5" style={{ color: "var(--teal)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary">Unlock all course materials</p>
                <p className="text-xs text-secondary">
                  {profile?.subscription?.status === "PENDING"
                    ? "Your payment is under review."
                    : "Subscribe to access PDFs, AI flashcards and quizzes."}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--teal)" }} />
            </div>
          </Link>
        </motion.div>
      )}

      {/* ── Study tools quick grid ──────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.1 }}>
        <p className="text-xs font-medium text-muted tracking-wide mb-3">STUDY TOOLS</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {studyTools.map((tool) => (
            <Link key={tool.href} href={tool.href}>
              <div className="glass-panel glass-panel-hover p-4 h-full">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: tool.dim }}>
                  <tool.icon className="h-4 w-4" style={{ color: tool.accent }} />
                </div>
                <p className="text-sm font-semibold text-primary">{tool.label}</p>
                <p className="text-xs text-muted mt-0.5">{tool.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* ── My Courses ──────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.15 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-primary">My Courses</h2>
          <Link href="/courses" className="text-xs flex items-center gap-1 transition-opacity hover:opacity-80"
            style={{ color: "var(--teal)" }}>
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl skeleton" />)}
          </div>
        ) : courses.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <BookOpen className="h-9 w-9 mx-auto mb-3" style={{ color: "var(--teal)", opacity: 0.5 }} />
            <p className="text-secondary text-sm font-medium">No courses available yet</p>
            <p className="text-muted text-xs mt-1">
              Courses for your department and year will appear here once published.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {courses.map((course) => {
              const cp = progress[course.id];
              const pct = cp?.pct ?? 0;
              return (
                <Link key={course.id} href={`/courses/${course.id}`}>
                  <div className="glass-panel glass-panel-hover flex items-center gap-4 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--teal-dim)" }}>
                      <BookOpen className="h-4 w-4" style={{ color: "var(--teal)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{course.title}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {course.teacher?.fullName && (
                          <span className="text-xs text-muted truncate flex-shrink-0">{course.teacher.fullName}</span>
                        )}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="flex-1 progress-track h-1 max-w-[120px]">
                            <div className="progress-fill h-1" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-muted flex-shrink-0">
                            {cp ? `${cp.viewedMaterials}/${cp.totalMaterials}` : `${course._count?.materials ?? 0} materials`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* ── AI assistant nudge ──────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.2 }}>
        <Link href="/ai-tutor">
          <div className="glass-panel glass-panel-hover px-6 py-5 flex items-center justify-between gap-4"
            style={{ background: "var(--ai-dim)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 animate-pulse-glow"
                style={{ background: "rgba(167,139,250,0.18)" }}>
                <Sparkles className="h-4 w-4" style={{ color: "var(--ai-primary)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">AI Study Assistant</p>
                <p className="text-xs text-secondary truncate">
                  Ask about any topic in your courses and get instant explanations.
                </p>
              </div>
            </div>
            <span className="flex-shrink-0 text-xs font-medium flex items-center gap-1"
              style={{ color: "var(--ai-primary)" }}>
              Ask <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </Link>
      </motion.div>
    </div>
  );
}
