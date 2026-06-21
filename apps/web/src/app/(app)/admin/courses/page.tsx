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
  UserCheck,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Department, AcademicYear, Semester, Course } from "@/types";

type Level = "departments" | "years" | "semesters" | "courses" | "materials";

interface Material {
  id: string;
  title: string;
  type: "PDF" | "IMAGE" | "YOUTUBE";
}

interface Teacher {
  id: string;
  fullName: string;
}

const typeIcon = { PDF: FileText, IMAGE: ImageIcon, YOUTUBE: PlayCircle };

export default function AdminCoursesPage() {
  const [level, setLevel] = useState<Level>("departments");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<Semester | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newCourseTeacherId, setNewCourseTeacherId] = useState("");
  const [creating, setCreating] = useState(false);

  const [assigningCourseId, setAssigningCourseId] = useState<string | null>(null);

  const [materialType, setMaterialType] = useState<"PDF" | "IMAGE" | "YOUTUBE">("PDF");
  const [materialTitle, setMaterialTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDepartments();
    loadTeachers();
  }, []);

  async function loadTeachers() {
    try {
      const res = await api.get("/users?role=TEACHER&limit=200");
      setTeachers(res.data.users ?? []);
    } catch { /* non-critical */ }
  }

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
    } finally { setLoading(false); }
  }

  async function loadSemesters(yearId: string) {
    setLoading(true);
    try {
      const res = await api.get(`/semesters?academicYearId=${yearId}`);
      setSemesters(res.data);
    } finally { setLoading(false); }
  }

  async function loadCourses(semesterId: string) {
    setLoading(true);
    try {
      const res = await api.get(`/courses?semesterId=${semesterId}`);
      setCourses(res.data);
    } finally { setLoading(false); }
  }

  async function loadMaterials(courseId: string) {
    setLoading(true);
    try {
      const res = await api.get(`/materials?courseId=${courseId}`);
      setMaterials(res.data);
    } finally { setLoading(false); }
  }

  function openDepartment(dept: Department) { setSelectedDept(dept); setLevel("years"); loadYears(dept.id); }
  function openYear(year: AcademicYear) { setSelectedYear(year); setLevel("semesters"); loadSemesters(year.id); }
  function openSemester(sem: Semester) { setSelectedSemester(sem); setLevel("courses"); loadCourses(sem.id); }
  function openCourse(course: Course) { setSelectedCourse(course); setLevel("materials"); loadMaterials(course.id); }

  function goBack(target: Level) {
    setLevel(target);
    if (target === "departments") { setSelectedDept(null); setSelectedYear(null); setSelectedSemester(null); setSelectedCourse(null); }
    if (target === "years") { setSelectedYear(null); setSelectedSemester(null); setSelectedCourse(null); }
    if (target === "semesters") { setSelectedSemester(null); setSelectedCourse(null); }
    if (target === "courses") { setSelectedCourse(null); }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      if (level === "departments") {
        await api.post("/departments", { name: newName });
        await loadDepartments();
      } else if (level === "years" && selectedDept) {
        await api.post("/academic-years", { departmentId: selectedDept.id, label: newName });
        await loadYears(selectedDept.id);
      } else if (level === "semesters" && selectedYear) {
        await api.post("/semesters", { academicYearId: selectedYear.id, name: newName });
        await loadSemesters(selectedYear.id);
      } else if (level === "courses" && selectedSemester) {
        const payload: Record<string, unknown> = { semesterId: selectedSemester.id, title: newName, isPublished: true };
        if (newCourseTeacherId) payload.teacherId = newCourseTeacherId;
        await api.post("/courses", payload);
        await loadCourses(selectedSemester.id);
        setNewCourseTeacherId("");
      }
      setNewName("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  async function handleAssignTeacher(courseId: string, teacherId: string) {
    try {
      await api.patch(`/courses/${courseId}`, { teacherId: teacherId || null });
      if (selectedSemester) await loadCourses(selectedSemester.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Failed to assign teacher");
    } finally {
      setAssigningCourseId(null);
    }
  }

  async function handleArchiveCourse(id: string) {
    await api.patch(`/courses/${id}/archive`);
    if (selectedSemester) loadCourses(selectedSemester.id);
  }

  async function handleUploadMaterial() {
    if (!selectedCourse || !materialTitle.trim()) return;
    setUploading(true);
    try {
      if (materialType === "YOUTUBE") {
        if (!youtubeUrl.trim()) { alert("Please enter a YouTube URL"); setUploading(false); return; }
        await api.post("/materials/youtube", { courseId: selectedCourse.id, title: materialTitle, type: "YOUTUBE", youtubeUrl: youtubeUrl.trim() });
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) { alert(`Please choose a ${materialType === "PDF" ? "PDF" : "image"} file`); setUploading(false); return; }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("courseId", selectedCourse.id);
        fd.append("title", materialTitle);
        fd.append("type", materialType);
        await api.post("/materials/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setMaterialTitle(""); setYoutubeUrl("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMaterials(selectedCourse.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Upload failed");
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

  const placeholders: Record<Level, string> = {
    departments: "Department name (e.g. Pharmacy)",
    years: "Year label (e.g. Year 2)",
    semesters: "Semester name (e.g. Semester 2)",
    courses: "Course title (e.g. Physiology II)",
    materials: "",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-semibold text-primary">Academic Structure</h1>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button onClick={() => goBack("departments")} className={cn("transition-colors", level === "departments" ? "text-primary font-medium" : "text-muted hover:text-secondary")}>Departments</button>
        {selectedDept && (<><ChevronRight className="h-3.5 w-3.5 text-muted" /><button onClick={() => goBack("years")} className={cn("transition-colors", level === "years" ? "text-primary font-medium" : "text-muted hover:text-secondary")}>{selectedDept.name}</button></>)}
        {selectedYear && (<><ChevronRight className="h-3.5 w-3.5 text-muted" /><button onClick={() => goBack("semesters")} className={cn("transition-colors", level === "semesters" ? "text-primary font-medium" : "text-muted hover:text-secondary")}>{selectedYear.label}</button></>)}
        {selectedSemester && (<><ChevronRight className="h-3.5 w-3.5 text-muted" /><button onClick={() => goBack("courses")} className={cn("transition-colors", level === "courses" ? "text-primary font-medium" : "text-muted hover:text-secondary")}>{selectedSemester.name}</button></>)}
        {selectedCourse && (<><ChevronRight className="h-3.5 w-3.5 text-muted" /><span className="text-primary font-medium">{selectedCourse.title}</span></>)}
      </div>

      {/* Add / create row */}
      {level !== "materials" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder={placeholders[level]}
              className="flex-1 bg-surface border border-default rounded-xl px-4 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all" />
            <button onClick={handleCreate} disabled={creating || !newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
          {level === "courses" && teachers.length > 0 && (
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted flex-shrink-0" />
              <select value={newCourseTeacherId} onChange={(e) => setNewCourseTeacherId(e.target.value)}
                className="flex-1 bg-surface border border-default rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:border-accent transition-all">
                <option value="">— Assign teacher (optional) —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Material upload form */}
      {level === "materials" && (
        <div className="bg-surface border border-default rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            {(["PDF", "IMAGE", "YOUTUBE"] as const).map((t) => (
              <button key={t} onClick={() => setMaterialType(t)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", materialType === t ? "bg-accent text-white" : "bg-elevated text-secondary hover:text-primary")}>{t}</button>
            ))}
          </div>
          <input value={materialTitle} onChange={(e) => setMaterialTitle(e.target.value)}
            placeholder="Material title" className="w-full bg-elevated border border-default rounded-xl px-4 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all" />
          {materialType === "YOUTUBE"
            ? <input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full bg-elevated border border-default rounded-xl px-4 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all" />
            : <input ref={fileInputRef} type="file" accept={materialType === "PDF" ? "application/pdf" : "image/*"} className="w-full text-sm text-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-accent-dim file:text-accent file:text-xs file:font-medium" />
          }
          <button onClick={handleUploadMaterial} disabled={uploading || !materialTitle.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading..." : "Upload Material"}
          </button>
        </div>
      )}

      {/* List */}
      <div className="min-h-[200px]">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={level} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.2 }} className="space-y-0">

              {level === "departments" && departments.map((dept, i) => (
                <button key={dept.id} onClick={() => openDepartment(dept)} className={cn("w-full flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg text-left hover:bg-elevated transition-colors", i < departments.length - 1 && "border-b border-subtle")}>
                  <FolderTree className="h-4 w-4 text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">{dept.name}</p>
                    <p className="text-xs text-muted">{dept._count?.academicYears ?? 0} years · {dept._count?.students ?? 0} students</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                </button>
              ))}

              {level === "years" && years.map((year, i) => (
                <button key={year.id} onClick={() => openYear(year)} className={cn("w-full flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg text-left hover:bg-elevated transition-colors", i < years.length - 1 && "border-b border-subtle")}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">{year.label}</p>
                    <p className="text-xs text-muted">{year._count?.semesters ?? 0} semesters</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                </button>
              ))}

              {level === "semesters" && semesters.map((sem, i) => (
                <button key={sem.id} onClick={() => openSemester(sem)} className={cn("w-full flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg text-left hover:bg-elevated transition-colors", i < semesters.length - 1 && "border-b border-subtle")}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">{sem.name}</p>
                    <p className="text-xs text-muted">{sem._count?.courses ?? 0} courses</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                </button>
              ))}

              {level === "courses" && courses.map((course, i) => (
                <div key={course.id} className={cn("py-3.5 px-2 -mx-2 rounded-lg hover:bg-elevated transition-colors", i < courses.length - 1 && "border-b border-subtle")}>
                  <div className="flex items-center gap-3">
                    <button onClick={() => openCourse(course)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <BookOpen className="h-4 w-4 text-teal flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary">{course.title}</p>
                        <p className="text-xs text-muted">{course.teacher?.fullName ?? "No teacher"} · {course.isPublished ? "Published" : "Draft"}</p>
                      </div>
                    </button>
                    {assigningCourseId === course.id ? (
                      <select autoFocus defaultValue={course.teacher?.id ?? ""} onBlur={() => setAssigningCourseId(null)}
                        onChange={(e) => handleAssignTeacher(course.id, e.target.value)}
                        className="text-xs bg-surface border border-default rounded-lg px-2 py-1 text-primary focus:outline-none focus:border-accent">
                        <option value="">— No teacher —</option>
                        {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => setAssigningCourseId(course.id)} title="Assign teacher" className="text-muted hover:text-accent transition-colors p-1.5">
                        <UserCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted flex-shrink-0" />
                    <button onClick={() => handleArchiveCourse(course.id)} className="text-muted hover:text-error transition-colors p-1.5" title="Archive">
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {level === "materials" && materials.map((m, i) => {
                const Icon = typeIcon[m.type];
                return (
                  <div key={m.id} className={cn("flex items-center gap-3 py-3.5 px-2 -mx-2 rounded-lg hover:bg-elevated transition-colors", i < materials.length - 1 && "border-b border-subtle")}>
                    <Icon className="h-4 w-4 text-accent flex-shrink-0" />
                    <p className="text-sm font-medium text-primary flex-1">{m.title}</p>
                    <span className="text-[10px] font-medium text-muted uppercase tracking-wide">{m.type}</span>
                    <button onClick={() => handleDeleteMaterial(m.id)} className="text-muted hover:text-error transition-colors p-1.5" title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}

              {!loading && (
                (level === "departments" && departments.length === 0) ||
                (level === "years" && years.length === 0) ||
                (level === "semesters" && semesters.length === 0) ||
                (level === "courses" && courses.length === 0) ||
                (level === "materials" && materials.length === 0)
              ) && (
                <p className="text-sm text-muted text-center py-12">
                  {level === "materials" ? "No materials yet — upload above." : "Nothing here yet — add one above."}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
