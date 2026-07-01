"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronRight,
  Archive,
  Loader2,
  FolderTree,
  BookOpen,
  FileText,
  Image as ImageIcon,
  PlayCircle,
  Upload,
  Trash2,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Department, AcademicYear, Semester, Course } from "@/types";

import { toast } from "sonner";

type Level = "departments" | "years" | "semesters" | "courses" | "materials";

interface Material {
  id: string;
  title: string;
  type: "PDF" | "IMAGE" | "YOUTUBE";
  ai?: {
    status: "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    error?: string | null;
  };
}

const typeIcon = { PDF: FileText, IMAGE: ImageIcon, YOUTUBE: PlayCircle };

export default function AdminCoursesPage() {
  const [level, setLevel] = useState<Level>("departments");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(
    null,
  );
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // -- Material upload form state --------------------------------
  const [materialType, setMaterialType] = useState<"PDF" | "IMAGE" | "YOUTUBE">(
    "PDF",
  );
  const [materialTitle, setMaterialTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Incremented whenever materialType changes so the file input
  // fully remounts — prevents the uncontrolled→controlled React warning
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    loadDepartments();
  }, []);

  const [teachers, setTeachers] = useState<{ id: string; fullName: string }[]>(
    [],
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState("");

  useEffect(() => {
    api
      .get("/users?role=TEACHER&limit=100")
      .then((res) => setTeachers(res.data.users ?? []))
      .catch(() => setTeachers([]));
  }, []);

  async function loadDepartments() {
    setLoading(true);
    try {
      const res = await api.get("/departments/admin");
      setDepartments(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadYears(deptId: string) {
    setLoading(true);
    try {
      const res = await api.get(`/academic-years?departmentId=${deptId}`);
      setYears(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadSemesters(yearId: string) {
    setLoading(true);
    try {
      const res = await api.get(`/semesters?academicYearId=${yearId}`);
      setSemesters(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadCourses(semesterId: string) {
    setLoading(true);
    try {
      const res = await api.get(`/courses/admin-semester?semesterId=${semesterId}`);
      setCourses(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadMaterials(courseId: string) {
    setLoading(true);
    try {
      const res = await api.get(`/materials?courseId=${courseId}`);
      const rows = res.data as Material[];
      setMaterials(rows);
      const pdfs = rows.filter((m) => m.type === "PDF");
      if (pdfs.length > 0) {
        const statuses = await Promise.all(
          pdfs.map(async (m) => {
            try {
              const status = await api.get(`/materials/${m.id}/ai-status`);
              return [m.id, status.data] as const;
            } catch {
              return [m.id, { status: "FAILED", error: "Could not load AI status" }] as const;
            }
          }),
        );
        const byId = new Map(statuses);
        setMaterials((current) =>
          current.map((m) => (byId.has(m.id) ? { ...m, ai: byId.get(m.id) } : m)),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function openDepartment(dept: Department) {
    setSelectedDept(dept);
    setLevel("years");
    loadYears(dept.id);
  }
  function openYear(year: AcademicYear) {
    setSelectedYear(year);
    setLevel("semesters");
    loadSemesters(year.id);
  }
  function openSemester(sem: Semester) {
    setSelectedSemester(sem);
    setLevel("courses");
    loadCourses(sem.id);
  }
  function openCourse(course: Course) {
    setSelectedCourse(course);
    setLevel("materials");
    loadMaterials(course.id);
  }

  function goBack(target: Level) {
    setLevel(target);
    if (target === "departments") {
      setSelectedDept(null);
      setSelectedYear(null);
      setSelectedSemester(null);
      setSelectedCourse(null);
    }
    if (target === "years") {
      setSelectedYear(null);
      setSelectedSemester(null);
      setSelectedCourse(null);
    }
    if (target === "semesters") {
      setSelectedSemester(null);
      setSelectedCourse(null);
    }
    if (target === "courses") {
      setSelectedCourse(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      if (level === "departments") {
        await api.post("/departments", { name: newName });
        await loadDepartments();
      } else if (level === "years" && selectedDept) {
        await api.post("/academic-years", {
          departmentId: selectedDept.id,
          label: newName,
        });
        await loadYears(selectedDept.id);
      } else if (level === "semesters" && selectedYear) {
        await api.post("/semesters", {
          academicYearId: selectedYear.id,
          name: newName,
        });
        await loadSemesters(selectedYear.id);
      } else if (level === "courses" && selectedSemester) {
        await api.post("/courses", {
          semesterId: selectedSemester.id,
          title: newName,
          teacherId: selectedTeacherId || undefined,
          isPublished: true,
        });
        setSelectedTeacherId("");
        await loadCourses(selectedSemester.id);
      }
      setNewName("");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function handleArchiveCourse(id: string) {
    await api.patch(`/courses/${id}/archive`);
    if (selectedSemester) loadCourses(selectedSemester.id);
  }

  async function handleAssignTeacher(courseId: string, teacherId: string) {
    try {
      await api.patch(`/courses/${courseId}`, { teacherId: teacherId || null });
      if (selectedSemester) await loadCourses(selectedSemester.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to assign teacher");
    }
  }

  // -- Material upload handlers --------------------------------
  async function handleUploadMaterial() {
    if (!selectedCourse || !materialTitle.trim()) return;

    setUploading(true);
    try {
      if (materialType === "YOUTUBE") {
        if (!youtubeUrl.trim()) {
          toast.error("Please enter a YouTube URL");
          setUploading(false);
          return;
        }
        await api.post("/materials/youtube", {
          courseId: selectedCourse.id,
          title: materialTitle,
          type: "YOUTUBE",
          youtubeUrl: youtubeUrl.trim(),
        });
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          toast.error(
            `Please choose a ${materialType === "PDF" ? "PDF" : "image"} file`,
          );
          setUploading(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        formData.append("courseId", selectedCourse.id);
        formData.append("title", materialTitle);
        formData.append("type", materialType);

        await api.post("/materials/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      setMaterialTitle("");
      setYoutubeUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileInputKey((k) => k + 1); // remount the file input to clear it
      await loadMaterials(selectedCourse.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteMaterial(id: string) {
    if (!selectedCourse) return;
    if (!confirm("Delete this material? This cannot be undone.")) return;
    await api.delete(`/materials/${id}`);
    await loadMaterials(selectedCourse.id);
  }

  // Re-run AI study-content generation for a PDF whose job failed.
  async function handleRegenerateAi(id: string) {
    try {
      await api.post(`/materials/${id}/ai-regenerate`);
      toast.success(
        "AI generation restarted — summary, flashcards and quiz will appear shortly.",
      );
      if (selectedCourse) await loadMaterials(selectedCourse.id);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not restart AI generation",
      );
    }
  }

  function aiStatusStyle(status?: string): React.CSSProperties {
    if (status === "COMPLETED") {
      return { background: "rgba(16,185,129,0.14)", color: "var(--state-success)" };
    }
    if (status === "FAILED") {
      return { background: "rgba(239,68,68,0.14)", color: "var(--state-error)" };
    }
    return { background: "rgba(245,158,11,0.14)", color: "var(--state-warning)" };
  }

  const placeholders: Record<Level, string> = {
    departments: "New department name (e.g. Pharmacy)",
    years: "New year label (e.g. Year 2)",
    semesters: "New semester name (e.g. Semester 2)",
    courses: "New course title (e.g. Physiology II)",
    materials: "",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-primary">
          Academic Structure
        </h1>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button
          onClick={() => goBack("departments")}
          className={cn(
            "transition-colors",
            level === "departments"
              ? "text-primary font-medium"
              : "text-muted hover:text-secondary",
          )}
        >
          Departments
        </button>
        {selectedDept && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted" />
            <button
              onClick={() => goBack("years")}
              className={cn(
                "transition-colors",
                level === "years"
                  ? "text-primary font-medium"
                  : "text-muted hover:text-secondary",
              )}
            >
              {selectedDept.name}
            </button>
          </>
        )}
        {selectedYear && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted" />
            <button
              onClick={() => goBack("semesters")}
              className={cn(
                "transition-colors",
                level === "semesters"
                  ? "text-primary font-medium"
                  : "text-muted hover:text-secondary",
              )}
            >
              {selectedYear.label}
            </button>
          </>
        )}
        {selectedSemester && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted" />
            <button
              onClick={() => goBack("courses")}
              className={cn(
                "transition-colors",
                level === "courses"
                  ? "text-primary font-medium"
                  : "text-muted hover:text-secondary",
              )}
            >
              {selectedSemester.name}
            </button>
          </>
        )}
        {selectedCourse && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted" />
            <span className="text-primary font-medium">
              {selectedCourse.title}
            </span>
          </>
        )}
      </div>

      {/* Add new row — hidden at materials level, replaced by upload form */}
      {level !== "materials" && (
        <div className="flex items-center gap-2">
          {level === "courses" && (
            <select
              value={selectedTeacherId}
              title="Select Course Assignment"
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-52 bg-surface border border-default rounded-xl px-3 py-2.5
                text-sm text-primary focus:outline-none focus:border-accent"
            >
              <option value="">No teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.fullName}
                </option>
              ))}
            </select>
          )}
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder={placeholders[level]}
            className="flex-1 bg-surface border border-default rounded-xl px-4 py-2.5
              text-sm text-primary placeholder:text-muted focus:outline-none
              focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-hover
              text-white rounded-xl text-sm font-medium transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add
          </button>
        </div>
      )}

      {/* Material upload form */}
      {level === "materials" && (
        <div className="bg-surface border border-default rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            {(["PDF", "IMAGE", "YOUTUBE"] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setMaterialType(t);
                  // Reset youtube URL when leaving YOUTUBE mode
                  if (t !== "YOUTUBE") setYoutubeUrl("");
                  // Remount the file input so React doesn't warn about
                  // uncontrolled→controlled transition
                  if (t !== "YOUTUBE") setFileInputKey((k) => k + 1);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  materialType === t
                    ? "bg-accent text-white"
                    : "bg-elevated text-secondary hover:text-primary",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            value={materialTitle}
            onChange={(e) => setMaterialTitle(e.target.value)}
            placeholder="Material title (e.g. Chapter 3 — Brachial Plexus)"
            className="w-full bg-elevated border border-default rounded-xl px-4 py-2.5
              text-sm text-primary placeholder:text-muted focus:outline-none
              focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />

          {materialType === "YOUTUBE" ? (
            <input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-elevated border border-default rounded-xl px-4 py-2.5
                text-sm text-primary placeholder:text-muted focus:outline-none
                focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
            />
          ) : (
            <input
              key={fileInputKey}
              id="course-material-upload"
              ref={fileInputRef}
              type="file"
              aria-label="Upload course material file"
              title="Upload course material file"
              accept={materialType === "PDF" ? "application/pdf" : "image/*"}
              className="w-full text-sm text-secondary file:mr-3 file:py-2 file:px-3
                file:rounded-lg file:border-0 file:bg-accent-dim file:text-accent
                file:text-xs file:font-medium"
            />
          )}

          <button
            onClick={handleUploadMaterial}
            disabled={uploading || !materialTitle.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-hover
              text-white rounded-xl text-sm font-medium transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading..." : "Upload Material"}
          </button>
        </div>
      )}

      {/* List */}
      <div className="min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={level}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-0"
            >
              {level === "departments" &&
                departments.map((dept, i) => (
                  <button
                    key={dept.id}
                    onClick={() => openDepartment(dept)}
                    className={cn(
                      "w-full flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg text-left",
                      "hover:bg-elevated transition-colors duration-150",
                      i < departments.length - 1 && "border-b border-subtle",
                    )}
                  >
                    <FolderTree className="h-4 w-4 text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">
                        {dept.name}
                      </p>
                      <p className="text-xs text-muted">
                        {dept._count?.academicYears ?? 0} year
                        {dept._count?.academicYears === 1 ? "" : "s"}
                        {" · "}
                        {dept._count?.students ?? 0} student
                        {dept._count?.students === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                  </button>
                ))}

              {level === "years" &&
                years.map((year, i) => (
                  <button
                    key={year.id}
                    onClick={() => openYear(year)}
                    className={cn(
                      "w-full flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg text-left",
                      "hover:bg-elevated transition-colors duration-150",
                      i < years.length - 1 && "border-b border-subtle",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">
                        {year.label}
                      </p>
                      <p className="text-xs text-muted">
                        {year._count?.semesters ?? 0} semester
                        {year._count?.semesters === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                  </button>
                ))}

              {level === "semesters" &&
                semesters.map((sem, i) => (
                  <button
                    key={sem.id}
                    onClick={() => openSemester(sem)}
                    className={cn(
                      "w-full flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg text-left",
                      "hover:bg-elevated transition-colors duration-150",
                      i < semesters.length - 1 && "border-b border-subtle",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">
                        {sem.name}
                      </p>
                      <p className="text-xs text-muted">
                        {sem._count?.courses ?? 0} course
                        {sem._count?.courses === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                  </button>
                ))}

              {level === "courses" &&
                courses.map((course, i) => (
                  <div
                    key={course.id}
                    className={cn(
                      "flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg",
                      "hover:bg-elevated transition-colors duration-150",
                      i < courses.length - 1 && "border-b border-subtle",
                    )}
                  >
                    <button
                      onClick={() => openCourse(course)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <BookOpen className="h-4 w-4 text-teal flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary">
                          {course.title}
                        </p>
                        <p className="text-xs text-muted">
                          {course.teacher?.fullName ?? "No teacher assigned"}
                          {" · "}
                          {course.isPublished ? "Published" : "Draft"}
                        </p>
                      </div>
                    </button>
                    <select
                      value={course.teacher?.id ?? ""}
                      onChange={(e) =>
                        handleAssignTeacher(course.id, e.target.value)
                      }
                      className="max-w-40 bg-elevated border border-default rounded-lg px-2 py-1
                        text-xs text-secondary focus:outline-none focus:border-accent"
                      title="Assign teacher"
                    >
                      <option value="">No teacher</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.fullName}
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                    <button
                      onClick={() => handleArchiveCourse(course.id)}
                      className="text-muted hover:text-error transition-colors p-1.5"
                      title="Archive course"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

              {level === "materials" &&
                materials.map((m, i) => {
                  const Icon = typeIcon[m.type];
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg",
                        "hover:bg-elevated transition-colors duration-150",
                        i < materials.length - 1 && "border-b border-subtle",
                      )}
                    >
                      <Icon className="h-4 w-4 text-accent flex-shrink-0" />
                      <p className="text-sm font-medium text-primary flex-1">
                        {m.title}
                      </p>
                      <span className="text-[10px] font-medium text-muted uppercase tracking-wide">
                        {m.type}
                      </span>
                      {m.type === "PDF" && (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          title={m.ai?.error ?? undefined}
                          style={aiStatusStyle(m.ai?.status)}
                        >
                          AI {m.ai?.status ?? "CHECKING"}
                        </span>
                      )}
                      {m.type === "PDF" && (
                        <button
                          type="button"
                          onClick={() => handleRegenerateAi(m.id)}
                          className="text-muted hover:text-ai transition-colors p-1.5"
                          title="Regenerate AI study content"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteMaterial(m.id)}
                        className="text-muted hover:text-error transition-colors p-1.5"
                        title="Delete material"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}

              {!loading &&
                ((level === "departments" && departments.length === 0) ||
                  (level === "years" && years.length === 0) ||
                  (level === "semesters" && semesters.length === 0) ||
                  (level === "courses" && courses.length === 0) ||
                  (level === "materials" && materials.length === 0)) && (
                  <p className="text-sm text-muted text-center py-12">
                    {level === "materials"
                      ? "No materials uploaded yet — use the form above."
                      : "Nothing here yet — add the first one above."}
                  </p>
                )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}



