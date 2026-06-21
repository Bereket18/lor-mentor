"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Sparkles,
  BookOpen,
  FileText,
  PlayCircle,
  ImageIcon,
  Loader2,
  GraduationCap,
  Flame,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { PdfViewer } from "@/components/shared/pdf-viewer";

interface Material {
  id: string;
  title: string;
  type: "PDF" | "IMAGE" | "YOUTUBE";
}

interface Course {
  id: string;
  title: string;
  description?: string | null;
  isPublished: boolean;
  teacher?: { id: string; fullName: string } | null;
  _count?: { materials: number };
  materials?: Material[];
}

const typeIcon = { PDF: FileText, IMAGE: ImageIcon, YOUTUBE: PlayCircle };
const typeColor = {
  PDF:     { bg: "rgba(14,165,233,0.12)",  color: "#0EA5E9" },
  IMAGE:   { bg: "rgba(16,185,129,0.12)",  color: "#10B981" },
  YOUTUBE: { bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.fullName?.split(" ")[0] ?? "Student";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const [courses,        setCourses]        = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [materials,      setMaterials]      = useState<Record<string, Material[]>>({});
  const [loadingMats,    setLoadingMats]    = useState<Record<string, boolean>>({});
  // PDF viewer modal
  const [pdfMaterial, setPdfMaterial] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    api.get("/courses/my-year")
      .then((r) => setCourses(r.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoadingCourses(false));
  }, []);

  async function toggleCourse(courseId: string) {
    if (expandedCourse === courseId) {
      setExpandedCourse(null);
      return;
    }
    setExpandedCourse(courseId);
    if (materials[courseId]) return; // already loaded
    setLoadingMats((prev) => ({ ...prev, [courseId]: true }));
    try {
      const r = await api.get(`/materials?courseId=${courseId}`);
      setMaterials((prev) => ({ ...prev, [courseId]: r.data ?? [] }));
    } finally {
      setLoadingMats((prev) => ({ ...prev, [courseId]: false }));
    }
  }

  // Determine department / year label from the first course's semester chain
  const deptLabel = (user as unknown as Record<string, { name?: string } | null>)?.department?.name ?? null;
  const yearLabel = (user as unknown as Record<string, { label?: string } | null>)?.academicYear?.label ?? null;

  return (
    <>
    <div className="max-w-3xl mx-auto space-y-10">

      {/* ── Header ───────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary">
            {greeting}, {firstName}
          </h1>
          {(deptLabel || yearLabel) && (
            <p className="text-sm text-secondary mt-1 flex items-center gap-2">
              <GraduationCap className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#2DD4BF" }} />
              {[deptLabel, yearLabel].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-secondary flex-shrink-0">
          <Flame className="h-3.5 w-3.5 text-warning" />
          <span>Keep it up!</span>
        </div>
      </motion.div>

      {/* ── AI Study Assistant ───────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.05 }}>
        <Link href="/ai-tutor">
          <div className={cn("relative rounded-2xl px-6 py-5 overflow-hidden bg-ai-dim border border-ai/20 hover:border-ai/40 transition-all duration-200 group")}>
            <div className="absolute inset-0 bg-gradient-to-r from-ai/[0.03] to-transparent" />
            <div className="relative z-10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-ai/15 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
                  <Sparkles className="h-4 w-4 text-ai" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">AI Study Assistant</p>
                  <p className="text-xs text-secondary truncate">Ask anything about your courses or get a study summary.</p>
                </div>
              </div>
              <span className="flex-shrink-0 text-xs font-medium text-ai flex items-center gap-1 group-hover:gap-2 transition-all">
                Ask <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* ── My Courses ───────────────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.1 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-primary">My Courses</h2>
          {courses.length > 0 && (
            <span className="text-xs text-muted">{courses.length} course{courses.length !== 1 ? "s" : ""}</span>
          )}
        </div>

        {loadingCourses ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2DD4BF" }} />
          </div>
        ) : courses.length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
          >
            <BookOpen className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(45,212,191,0.3)" }} />
            <p className="text-secondary text-sm font-medium">No courses available yet</p>
            <p className="text-muted text-xs mt-1">
              {!deptLabel && !yearLabel
                ? "Your account has no department or academic year assigned yet. Please contact an administrator."
                : "Courses for your department and year will appear here once published by your teachers."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {courses.map((course) => {
              const isExpanded = expandedCourse === course.id;
              const mats = materials[course.id] ?? [];
              const isLoadingMats = loadingMats[course.id];
              const matCount = course._count?.materials ?? 0;

              return (
                <div
                  key={course.id}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{ border: isExpanded ? "1px solid rgba(45,212,191,0.25)" : "1px solid rgba(45,212,191,0.1)", background: isExpanded ? "var(--accent-dim)" : "var(--bg-surface)" }}
                >
                  {/* Course header — click to expand */}
                  <button
                    onClick={() => toggleCourse(course.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-elevated/50"
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(20,120,120,0.2)" }}>
                      <BookOpen className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-primary truncate">{course.title}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {course.teacher?.fullName ?? "—"}
                        {matCount > 0 && <> · <span style={{ color: "#2DD4BF" }}>{matCount} material{matCount !== 1 ? "s" : ""}</span></>}
                      </p>
                    </div>
                    <ArrowRight
                      className="h-4 w-4 flex-shrink-0 transition-transform"
                      style={{ color: "rgba(45,212,191,0.5)", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                    />
                  </button>

                  {/* Materials list — only when expanded */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-1.5">
                      {course.description && (
                        <p className="text-xs text-secondary mb-3 pl-1">{course.description}</p>
                      )}
                      {isLoadingMats ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#2DD4BF" }} />
                        </div>
                      ) : mats.length === 0 ? (
                        <p className="text-xs text-muted text-center py-4">No materials uploaded yet.</p>
                      ) : (
                        mats.map((m) => {
                          const Icon = typeIcon[m.type];
                          const col  = typeColor[m.type];
                          const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
                          function handleMaterialClick() {
                            if (m.type === "PDF") {
                              setPdfMaterial({ id: m.id, title: m.title });
                            } else if (m.type === "YOUTUBE") {
                              window.open(`/api/v1/materials/${m.id}/file`, "_blank");
                            } else {
                              window.open(`${apiBase}/api/v1/materials/${m.id}/file`, "_blank");
                            }
                          }
                          return (
                            <button
                              key={m.id}
                              onClick={handleMaterialClick}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-left"
                              style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.07)" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent-dim)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
                            >
                              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: col.bg }}>
                                <Icon className="h-3 w-3" style={{ color: col.color }} />
                              </div>
                              <p className="text-sm text-primary flex-1 truncate">{m.title}</p>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: col.bg, color: col.color }}>{m.type}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

    </div>

    {/* ── PDF Viewer Modal ─────────────────────────────────── */}
    <AnimatePresence>
      {pdfMaterial && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "rgba(0,0,0,0.85)" }}
        >
          {/* Modal header */}
          <div
            className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}
          >
            <p className="text-sm font-semibold text-primary truncate max-w-[calc(100%-3rem)]">
              {pdfMaterial.title}
            </p>
            <button
              onClick={() => setPdfMaterial(null)}
              className="p-1.5 rounded-lg transition-colors hover:text-primary text-muted flex-shrink-0"
              aria-label="Close PDF viewer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* Viewer */}
          <div className="flex-1 min-h-0 p-4">
            <PdfViewer
              src={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/api/v1/materials/${pdfMaterial.id}/file`}
              height="100%"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
