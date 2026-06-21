"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, FileText, PlayCircle, ImageIcon,
  Loader2, GraduationCap, ChevronDown, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { PdfViewer } from "@/components/shared/pdf-viewer";

// ── Types ─────────────────────────────────────────────────
interface Material {
  id: string;
  title: string;
  type: "PDF" | "IMAGE" | "YOUTUBE";
  youtubeUrl?: string | null;
}

interface Course {
  id: string;
  title: string;
  description?: string | null;
  teacher?: { id: string; fullName: string } | null;
  _count?: { materials: number };
  semester: { id: string; name: string };
}

// ── Helpers ────────────────────────────────────────────────
const typeIcon = { PDF: FileText, IMAGE: ImageIcon, YOUTUBE: PlayCircle };
const typeColor = {
  PDF:     { bg: "rgba(14,165,233,0.12)",  color: "#0EA5E9" },
  IMAGE:   { bg: "rgba(16,185,129,0.12)",  color: "#10B981" },
  YOUTUBE: { bg: "rgba(239,68,68,0.12)",   color: "#EF4444" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

// ── Component ──────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuth();

  // Pull dept + year from enriched /me response
  const deptLabel  = (user as unknown as Record<string, { name?: string }  | null>)?.department?.name   ?? null;
  const yearLabel  = (user as unknown as Record<string, { label?: string } | null>)?.academicYear?.label ?? null;

  const [courses,        setCourses]        = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [materials,      setMaterials]      = useState<Record<string, Material[]>>({});
  const [loadingMats,    setLoadingMats]    = useState<Record<string, boolean>>({});
  const [pdfMaterial,    setPdfMaterial]    = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    api.get("/courses/my-year")
      .then((r) => setCourses(r.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoadingCourses(false));
  }, []);

  async function toggleCourse(courseId: string) {
    if (expandedCourse === courseId) { setExpandedCourse(null); return; }
    setExpandedCourse(courseId);
    if (materials[courseId]) return;
    setLoadingMats((p) => ({ ...p, [courseId]: true }));
    try {
      const r = await api.get(`/materials?courseId=${courseId}`);
      setMaterials((p) => ({ ...p, [courseId]: r.data ?? [] }));
    } finally {
      setLoadingMats((p) => ({ ...p, [courseId]: false }));
    }
  }

  function openMaterial(m: Material) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    if (m.type === "PDF") {
      setPdfMaterial({ id: m.id, title: m.title });
    } else if (m.type === "YOUTUBE" && m.youtubeUrl) {
      window.open(m.youtubeUrl, "_blank");
    } else {
      window.open(`${apiBase}/api/v1/materials/${m.id}/file`, "_blank");
    }
  }

  // Group courses by semester
  const bySemester = courses.reduce<Record<string, { name: string; courses: Course[] }>>((acc, c) => {
    const sid = c.semester.id;
    if (!acc[sid]) acc[sid] = { name: c.semester.name, courses: [] };
    acc[sid].courses.push(c);
    return acc;
  }, {});

  return (
    <>
    <div className="max-w-2xl mx-auto space-y-8 pb-10">

      {/* ── Breadcrumb header ──────────────────────────────── */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <div className="flex items-center gap-2 text-sm text-secondary mb-1">
          <GraduationCap className="h-4 w-4 flex-shrink-0" style={{ color: "#2DD4BF" }} />
          {deptLabel && <span className="font-medium text-primary">{deptLabel}</span>}
          {deptLabel && yearLabel && <span className="text-muted">›</span>}
          {yearLabel && <span className="font-medium text-primary">{yearLabel}</span>}
          {!deptLabel && !yearLabel && <span className="text-muted">No department assigned</span>}
        </div>
        <h1 className="font-display text-xl font-bold text-primary">
          {deptLabel ? "My Courses" : "Dashboard"}
        </h1>
        {!deptLabel && !yearLabel && (
          <p className="text-xs text-muted mt-1">Contact an administrator to assign your department and year.</p>
        )}
      </motion.div>

      {/* ── Course list ────────────────────────────────────── */}
      {loadingCourses ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2DD4BF" }} />
        </div>
      ) : courses.length === 0 ? (
        <motion.div
          initial="hidden" animate="show" variants={fadeUp}
          className="rounded-2xl p-10 text-center"
          style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
        >
          <BookOpen className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(45,212,191,0.3)" }} />
          <p className="text-secondary text-sm font-medium">No courses yet</p>
          <p className="text-muted text-xs mt-1">
            Courses published for your year will appear here.
          </p>
        </motion.div>
      ) : (
        // Render semester sections
        Object.entries(bySemester).map(([semId, sem], si) => (
          <motion.div
            key={semId}
            initial="hidden" animate="show" variants={fadeUp}
            transition={{ delay: si * 0.06 }}
          >
            {/* Semester label */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(45,212,191,0.1)", color: "#2DD4BF" }}
              >
                {sem.name}
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--border-subtle)" }} />
            </div>

            {/* Courses in this semester */}
            <div className="space-y-2">
              {sem.courses.map((course) => {
                const isExpanded   = expandedCourse === course.id;
                const mats         = materials[course.id] ?? [];
                const isLoadingM   = loadingMats[course.id];
                const matCount     = course._count?.materials ?? 0;

                return (
                  <div
                    key={course.id}
                    className="rounded-2xl overflow-hidden transition-all"
                    style={{
                      border: isExpanded
                        ? "1px solid rgba(45,212,191,0.3)"
                        : "1px solid var(--border-default)",
                      background: "var(--bg-surface)",
                    }}
                  >
                    {/* Course row — click to expand */}
                    <button
                      onClick={() => toggleCourse(course.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
                      style={{ background: isExpanded ? "rgba(45,212,191,0.05)" : "transparent" }}
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(20,120,120,0.15)" }}
                      >
                        <BookOpen className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-primary truncate">{course.title}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {course.teacher?.fullName ?? "No teacher assigned"}
                          {matCount > 0 && (
                            <> · <span style={{ color: "#2DD4BF" }}>{matCount} material{matCount !== 1 ? "s" : ""}</span></>
                          )}
                        </p>
                      </div>

                      <ChevronDown
                        className="h-4 w-4 flex-shrink-0 transition-transform duration-200"
                        style={{
                          color: "rgba(45,212,191,0.6)",
                          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      />
                    </button>

                    {/* Materials — only when expanded */}
                    {isExpanded && (
                      <div
                        className="px-4 pb-4 pt-1 space-y-1.5"
                        style={{ borderTop: "1px solid var(--border-subtle)" }}
                      >
                        {course.description && (
                          <p className="text-xs text-secondary py-2">{course.description}</p>
                        )}

                        {isLoadingM ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#2DD4BF" }} />
                          </div>
                        ) : mats.length === 0 ? (
                          <p className="text-xs text-muted text-center py-3">No materials uploaded yet.</p>
                        ) : (
                          mats.map((m) => {
                            const Icon = typeIcon[m.type];
                            const col  = typeColor[m.type];
                            return (
                              <button
                                key={m.id}
                                onClick={() => openMaterial(m)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                                style={{
                                  background: "var(--bg-elevated)",
                                  border: "1px solid var(--border-subtle)",
                                }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(45,212,191,0.3)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border-subtle)"; }}
                              >
                                <div
                                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ background: col.bg }}
                                >
                                  <Icon className="h-3 w-3" style={{ color: col.color }} />
                                </div>
                                <p className="text-sm text-primary flex-1 truncate">{m.title}</p>
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: col.bg, color: col.color }}
                                >
                                  {m.type}
                                </span>
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
          </motion.div>
        ))
      )}
    </div>

    {/* ── PDF Viewer Modal ──────────────────────────────────── */}
    <AnimatePresence>
      {pdfMaterial && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "rgba(0,0,0,0.88)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)" }}
          >
            <p className="text-sm font-semibold text-primary truncate max-w-[calc(100%-3rem)]">
              {pdfMaterial.title}
            </p>
            <button
              onClick={() => setPdfMaterial(null)}
              className="p-1.5 rounded-lg text-muted hover:text-primary transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
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
