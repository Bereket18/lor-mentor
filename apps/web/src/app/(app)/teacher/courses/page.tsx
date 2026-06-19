"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, FileText, PlayCircle, ImageIcon, Upload,
  Loader2, Trash2, ChevronRight, Plus,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

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
  isPublished: boolean;
  materials: Material[];
}

const typeIcon = { PDF: FileText, IMAGE: ImageIcon, YOUTUBE: PlayCircle };
const typeColor = {
  PDF:     { bg: "rgba(14,165,233,0.12)", color: "#0EA5E9" },
  IMAGE:   { bg: "rgba(16,185,129,0.12)", color: "#10B981" },
  YOUTUBE: { bg: "rgba(239,68,68,0.12)",  color: "#EF4444" },
};

function GlowInput(props: React.InputHTMLAttributes<HTMLInputElement> & { hasError?: boolean }) {
  const { hasError, className: _c, ...rest } = props;
  return (
    <input
      {...rest}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary placeholder:text-muted/60 outline-none transition-all duration-200"
      style={{ background: "rgba(255,255,255,0.04)", border: hasError ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(45,212,191,0.12)" }}
      onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.1)"; }}
      onBlur={(e)  => { e.currentTarget.style.border = hasError ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(45,212,191,0.12)"; e.currentTarget.style.boxShadow = ""; }}
    />
  );
}

export default function TeacherCoursesPage() {
  const [courses,       setCourses]       = useState<Course[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [selectedCourse,setSelectedCourse]= useState<Course | null>(null);
  const [matType,       setMatType]       = useState<"PDF"|"IMAGE"|"YOUTUBE">("PDF");
  const [matTitle,      setMatTitle]      = useState("");
  const [youtubeUrl,    setYoutubeUrl]    = useState("");
  const [uploading,     setUploading]     = useState(false);
  const [fileKey,       setFileKey]       = useState(0);
  const [error,         setError]         = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadCourses(); }, []);

  async function loadCourses() {
    setLoading(true);
    try {
      const r = await api.get("/courses/mine");
      // For each course, also load its materials
      const withMaterials = await Promise.all(
        (r.data ?? []).map(async (c: Course) => {
          try {
            const m = await api.get(`/materials?courseId=${c.id}`);
            return { ...c, materials: m.data ?? [] };
          } catch { return { ...c, materials: [] }; }
        })
      );
      setCourses(withMaterials);
    } finally { setLoading(false); }
  }

  async function handleUpload() {
    if (!selectedCourse || !matTitle.trim()) { setError("Please enter a material title."); return; }
    setError("");
    setUploading(true);
    try {
      if (matType === "YOUTUBE") {
        if (!youtubeUrl.trim()) { setError("Please enter a YouTube URL."); setUploading(false); return; }
        await api.post("/materials/youtube", { courseId: selectedCourse.id, title: matTitle, type: "YOUTUBE", youtubeUrl });
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) { setError("Please choose a file."); setUploading(false); return; }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("courseId", selectedCourse.id);
        fd.append("title", matTitle);
        fd.append("type", matType);
        await api.post("/materials/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setMatTitle(""); setYoutubeUrl(""); setFileKey((k) => k + 1);
      // Refresh materials for the selected course
      const m = await api.get(`/materials?courseId=${selectedCourse.id}`);
      const updated = courses.map((c) => c.id === selectedCourse.id ? { ...c, materials: m.data ?? [] } : c);
      setCourses(updated);
      setSelectedCourse((prev) => prev ? { ...prev, materials: m.data ?? [] } : null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Upload failed. Please try again.");
    } finally { setUploading(false); }
  }

  async function handleDelete(materialId: string) {
    if (!selectedCourse) return;
    if (!confirm("Delete this material? This cannot be undone.")) return;
    await api.delete(`/materials/${materialId}`);
    const m = await api.get(`/materials?courseId=${selectedCourse.id}`);
    const updated = courses.map((c) => c.id === selectedCourse.id ? { ...c, materials: m.data ?? [] } : c);
    setCourses(updated);
    setSelectedCourse((prev) => prev ? { ...prev, materials: m.data ?? [] } : null);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">My Courses</h1>
        <p className="text-secondary text-sm">Select a course to manage its materials.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#2DD4BF" }} />
        </div>
      ) : courses.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
        >
          <BookOpen className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(45,212,191,0.3)" }} />
          <p className="text-secondary text-sm">No courses assigned to you yet.</p>
          <p className="text-muted text-xs mt-1">Ask an admin to assign a course.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Course list */}
          <div className="lg:col-span-2 space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Your Courses</p>
            {courses.map((course) => (
              <button
                key={course.id}
                onClick={() => { setSelectedCourse(course); setError(""); }}
                className={cn(
                  "w-full text-left px-4 py-3.5 rounded-2xl transition-all",
                  selectedCourse?.id === course.id ? "ring-1" : "",
                )}
                style={
                  selectedCourse?.id === course.id
                    ? { background: "linear-gradient(135deg, rgba(20,120,120,0.25) 0%, rgba(45,212,191,0.1) 100%)", border: "1px solid rgba(45,212,191,0.3)" }
                    : { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(45,212,191,0.08)" }
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(20,120,120,0.2)" }}
                  >
                    <BookOpen className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{course.title}</p>
                    <p className="text-xs text-muted mt-0.5">{course.materials.length} material{course.materials.length !== 1 ? "s" : ""}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "rgba(45,212,191,0.4)" }} />
                </div>
              </button>
            ))}
          </div>

          {/* Material panel */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {selectedCourse ? (
                <motion.div
                  key={selectedCourse.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div>
                    <h2 className="font-display text-lg font-semibold text-primary">{selectedCourse.title}</h2>
                    {selectedCourse.description && (
                      <p className="text-secondary text-sm mt-0.5">{selectedCourse.description}</p>
                    )}
                  </div>

                  {/* Upload form */}
                  <div
                    className="rounded-2xl p-4 space-y-3"
                    style={{ background: "rgba(45,212,191,0.03)", border: "1px solid rgba(45,212,191,0.1)" }}
                  >
                    <p className="text-xs font-semibold text-muted uppercase tracking-widest">
                      <Plus className="h-3 w-3 inline mr-1" />Add Material
                    </p>

                    {/* Type selector */}
                    <div className="flex items-center gap-2">
                      {(["PDF", "IMAGE", "YOUTUBE"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => { setMatType(t); if (t !== "YOUTUBE") setFileKey((k) => k + 1); setYoutubeUrl(""); setError(""); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={
                            matType === t
                              ? { background: "linear-gradient(135deg, #147878, #1A9494)", color: "#fff", boxShadow: "0 0 12px rgba(45,212,191,0.3)" }
                              : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(45,212,191,0.1)" }
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    {/* Title */}
                    <GlowInput value={matTitle} onChange={(e) => setMatTitle(e.target.value)} placeholder="Material title (e.g. Chapter 3 — Brachial Plexus)" />

                    {/* File / URL */}
                    {matType === "YOUTUBE" ? (
                      <GlowInput value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                    ) : (
                      <input
                        key={fileKey}
                        ref={fileRef}
                        type="file"
                        accept={matType === "PDF" ? "application/pdf" : "image/*"}
                        className="w-full text-sm text-muted/70 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:cursor-pointer transition-all"
                        style={{ fileSelector: "teal" } as React.CSSProperties}
                      />
                    )}

                    {error && <p className="text-xs" style={{ color: "#EF4444" }}>{error}</p>}

                    <button
                      onClick={handleUpload}
                      disabled={uploading || !matTitle.trim()}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: "linear-gradient(135deg, #0F6B6B 0%, #147878 40%, #1A9494 100%)",
                        boxShadow: "0 0 16px rgba(20,184,166,0.3)",
                      }}
                    >
                      {uploading ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4" />Upload Material</>}
                    </button>
                  </div>

                  {/* Materials list */}
                  <div>
                    <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">
                      Uploaded Materials ({selectedCourse.materials.length})
                    </p>
                    {selectedCourse.materials.length === 0 ? (
                      <div
                        className="rounded-2xl p-6 text-center"
                        style={{ border: "1px dashed rgba(45,212,191,0.15)" }}
                      >
                        <p className="text-muted text-sm">No materials yet — upload one above.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {selectedCourse.materials.map((m) => {
                          const Icon  = typeIcon[m.type];
                          const color = typeColor[m.type];
                          return (
                            <div
                              key={m.id}
                              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all group"
                              style={{ border: "1px solid rgba(45,212,191,0.07)" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(45,212,191,0.03)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                            >
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: color.bg }}
                              >
                                <Icon className="h-3.5 w-3.5" style={{ color: color.color }} />
                              </div>
                              <p className="text-sm font-medium text-primary flex-1 truncate">{m.title}</p>
                              <span
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: color.bg, color: color.color }}
                              >
                                {m.type}
                              </span>
                              <button
                                onClick={() => handleDelete(m.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg"
                                style={{ color: "rgba(239,68,68,0.7)" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-16 rounded-2xl"
                  style={{ border: "1px dashed rgba(45,212,191,0.15)" }}
                >
                  <BookOpen className="h-10 w-10 mb-4" style={{ color: "rgba(45,212,191,0.25)" }} />
                  <p className="text-secondary text-sm">Select a course to manage its materials</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
