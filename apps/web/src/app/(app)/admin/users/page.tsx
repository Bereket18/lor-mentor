"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Loader2, Shield, UserCheck, Trash2,
  ChevronUp, ChevronDown, Search, AlertTriangle,
  ShieldCheck, ShieldOff,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useConfirm } from "@/components/ui/confirm-dialog-provider";

import { toast } from "sonner";

interface Department { id: string; name: string }

interface Course {
  id: string;
  title: string;
  isPublished: boolean;
  isArchived: boolean;
  teacher?: { id: string; fullName: string } | null;
  semester?: {
    id: string;
    name: string;
    academicYear?: {
      id: string;
      label: string;
      department?: { name: string } | null;
    } | null;
  } | null;
}

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isAnatomyReviewer?: boolean;
  createdAt: string;
  updatedAt: string;
  departmentId?: string | null;
  academicYearId?: string | null;
  department?: { id: string; name: string } | null;
  academicYear?: { id: string; label: string } | null;
}

// Role display config
const ROLE_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  SUPER_ADMIN: { label: "Super Admin", bg: "rgba(167,139,250,0.15)", color: "#A78BFA" },
  ADMIN:       { label: "Admin",       bg: "rgba(14,165,233,0.15)",  color: "#0EA5E9" },
  TEACHER:     { label: "Teacher",     bg: "rgba(45,212,191,0.15)",  color: "#2DD4BF" },
  STUDENT:     { label: "Student",     bg: "rgba(100,116,139,0.15)", color: "#94A3B8" },
  GUEST:       { label: "Guest",       bg: "rgba(100,116,139,0.10)", color: "#64748B" },
};

function GlowInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary placeholder:text-muted/60 outline-none transition-all duration-200"
      style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.12)" }}
      onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.5)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(20,184,166,0.1)"; }}
      onBlur={(e)  => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.12)"; e.currentTarget.style.boxShadow = ""; }}
    />
  );
}

export default function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const confirm = useConfirm();
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [users,       setUsers]       = useState<User[]>([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter,   setDeptFilter]   = useState("");
  const [sortByRole,  setSortByRole]  = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [academicYears, setAcademicYears] = useState<{ id: string; label: string }[]>([]);
  const [newStaff, setNewStaff] = useState({
    fullName: "", email: "",
    role: "TEACHER" as "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN",
    departmentId: "", academicYearId: "",
  });
  const [createdResult,  setCreatedResult]  = useState<{ name: string; email: string; invitationSent: boolean; setupUrl?: string; courses?: number } | null>(null);
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [cleaning,       setCleaning]       = useState(false);
  const [cleanupResult,  setCleanupResult]  = useState<string | null>(null);
  const [deletingId,     setDeletingId]     = useState<string | null>(null);
  const [reviewerBusyId, setReviewerBusyId] = useState<string | null>(null);

  // Teacher course pre-assignment (create panel)
  const [courses,           setCourses]           = useState<Course[]>([]);
  const [coursesLoading,    setCoursesLoading]    = useState(false);
  const [courseSearch,      setCourseSearch]      = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

  // Program (dept/year) assignment inline state
  const [assigningId,  setAssigningId]  = useState<string | null>(null);
  const [assignDeptId, setAssignDeptId] = useState("");
  const [assignYearId, setAssignYearId] = useState("");
  const [assignYears,  setAssignYears]  = useState<{ id: string; label: string }[]>([]);
  const [assigning,    setAssigning]    = useState(false);

  // Roles this actor may create (admins can't mint admins/super-admins)
  const creatableRoles = isSuperAdmin
    ? (["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"] as const)
    : (["STUDENT", "TEACHER"] as const);
  const isStudentRole = newStaff.role === "STUDENT";
  const isPrivilegedRole =
    newStaff.role === "ADMIN" || newStaff.role === "SUPER_ADMIN";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        limit: "100",
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(sortByRole ? { sortBy: "role" } : {}),
        ...(statusFilter ? { isActive: statusFilter } : {}),
        ...(deptFilter ? { departmentId: deptFilter } : {}),
      });
      const res = await api.get(`/users?${params}`);
      setUsers(res.data.users ?? []);
      setTotal(res.data.meta?.total ?? res.data.users?.length ?? 0);
    } catch {
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, sortByRole, statusFilter, deptFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    api.get("/departments").then((r) => setDepartments(r.data ?? []));
  }, []);

  // Load academic years for the chosen department when creating a student.
  // (Only fetches — the year selector renders for students only, so stale
  // years while on another role are never shown.)
  useEffect(() => {
    if (isStudentRole && newStaff.departmentId) {
      api.get(`/academic-years?departmentId=${newStaff.departmentId}`)
        .then((r) => setAcademicYears(r.data ?? []))
        .catch(() => setAcademicYears([]));
    }
  }, [isStudentRole, newStaff.departmentId]);

  // Load academic years for the inline assign-program form.
  // When assignDeptId is empty, assignYears stays empty because the fetch
  // never runs — no synchronous setState needed inside the effect body.
  useEffect(() => {
    if (!assignDeptId) {
      return;
    }
    let cancelled = false;
    api.get(`/academic-years?departmentId=${assignDeptId}`)
      .then((r) => { if (!cancelled) setAssignYears(r.data ?? []); })
      .catch(() => { if (!cancelled) setAssignYears([]); });
    return () => { cancelled = true; };
  }, [assignDeptId]);

  // Derive empty years when no department is selected (during render, not in effect)
  const effectiveAssignYears = assignDeptId ? assignYears : [];

  // Load the course list for teacher pre-assignment while the create panel is
  // open on the TEACHER role, so the admin can create the account and assign
  // courses in one step (audit finding A1 — no second manual pass needed).
  useEffect(() => {
    if (!showCreate || newStaff.role !== "TEACHER") return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCoursesLoading(true);
    api.get("/courses/admin")
      .then((r) => { if (!cancelled) setCourses(r.data ?? []); })
      .catch(() => { if (!cancelled) setCourses([]); })
      .finally(() => { if (!cancelled) setCoursesLoading(false); });
    return () => { cancelled = true; };
  }, [showCreate, newStaff.role]);

  // Teacher create-panel: the chosen department narrows the pickable courses
  // (mirrors the API rule — assignable courses must belong to the college's
  // active catalog).
  const createDeptName = departments.find((d) => d.id === newStaff.departmentId)?.name ?? "";
  const visibleCourses = courses
    .filter((c) => !c.isArchived)
    .filter((c) => !createDeptName || c.semester?.academicYear?.department?.name === createDeptName)
    .filter((c) => !courseSearch.trim() || c.title.toLowerCase().includes(courseSearch.trim().toLowerCase()))
    .sort((a, b) => {
      const da = a.semester?.academicYear?.department?.name ?? "";
      const db = b.semester?.academicYear?.department?.name ?? "";
      if (da !== db) return da.localeCompare(db);
      const ya = a.semester?.academicYear?.label ?? "";
      const yb = b.semester?.academicYear?.label ?? "";
      if (ya !== yb) return ya.localeCompare(yb);
      return a.title.localeCompare(b.title);
    });

  async function handleCreateStaff() {
    if (!newStaff.fullName.trim() || !newStaff.email.trim()) return;
    if (isStudentRole && (!newStaff.departmentId || !newStaff.academicYearId)) {
      toast.error("Students require a department and academic year");
      return;
    }
    setCreating(true);
    setCreatedResult(null);
    try {
      const payload: Record<string, unknown> = {
        fullName: newStaff.fullName,
        email: newStaff.email,
        role: newStaff.role,
      };
      if (!isPrivilegedRole && newStaff.departmentId) payload.departmentId = newStaff.departmentId;
      if (isStudentRole && newStaff.academicYearId) payload.academicYearId = newStaff.academicYearId;
      if (newStaff.role === "TEACHER" && selectedCourseIds.length > 0) payload.courseIds = selectedCourseIds;
      const res = await api.post("/users/create-staff", payload);
      setCreatedResult({
        name: res.data.user.fullName,
        email: res.data.user.email,
        invitationSent: res.data.invitationSent !== false,
        setupUrl: res.data.setupUrl as string | undefined,
        courses: newStaff.role === "TEACHER" ? selectedCourseIds.length : 0,
      });
      setNewStaff({ fullName: "", email: "", role: "TEACHER", departmentId: "", academicYearId: "" });
      setSelectedCourseIds([]);
      await loadUsers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(target: User) {
    const confirmed = await confirm({
      title: "Delete this user?",
      description: `Permanently delete ${target.fullName}? This cannot be undone.`,
      confirmLabel: "Delete user",
      destructive: true,
    });
    if (!confirmed) return;
    setDeletingId(target.id);
    try {
      await api.delete(`/users/${target.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to delete user");
    } finally {
      setDeletingId(null);
    }
  }

  // Can the current actor act on this target?
  const privileged = (r: string) => r === "ADMIN" || r === "SUPER_ADMIN";
  const canModify = (target: User) =>
    target.id !== currentUser?.id &&
    (isSuperAdmin || !privileged(target.role));
  // Role options the actor may assign
  const assignableRoles = isSuperAdmin
    ? ["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "GUEST"]
    : ["STUDENT", "TEACHER"];

  async function handleRoleChange(userId: string, role: string) {
    try {
      const res = await api.patch(`/users/${userId}/role`, { role });
      // The API keeps isAnatomyReviewer in sync with the role (all teachers
      // have it, everyone else does not), so mirror the returned value.
      const nextFlag =
        res.data?.user?.isAnatomyReviewer ?? role === "TEACHER";
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, role, isAnatomyReviewer: nextFlag } : u,
        ),
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to change role");
    }
  }

  // Grant or revoke a teacher's anatomy reviewer access. Revoking is
  // destructive to that teacher's workflow (they can no longer approve
  // structures), so it asks for confirmation first.
  async function handleReviewerToggle(target: User) {
    const next = !target.isAnatomyReviewer;
    if (!next) {
      const confirmed = await confirm({
        title: "Revoke anatomy reviewer access?",
        description: `${target.fullName} will no longer be able to review or approve anatomy structures. Approvals they already gave are not affected.`,
        confirmLabel: "Revoke access",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setReviewerBusyId(target.id);
    try {
      const res = await api.patch(`/users/${target.id}/anatomy-reviewer`, {
        isAnatomyReviewer: next,
      });
      const value = res.data?.user?.isAnatomyReviewer ?? next;
      setUsers((prev) =>
        prev.map((u) =>
          u.id === target.id ? { ...u, isAnatomyReviewer: value } : u,
        ),
      );
      toast.success(
        value
          ? "Anatomy reviewer access granted"
          : "Anatomy reviewer access revoked",
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? "Failed to update reviewer access",
      );
    } finally {
      setReviewerBusyId(null);
    }
  }

  async function handleStatusToggle(userId: string, isActive: boolean) {
    try {
      await api.patch(`/users/${userId}/status`, { isActive: !isActive });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !isActive } : u));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to update status");
    }
  }

  async function handleAssignDepartment(userId: string) {
    if (!assignDeptId) return;
    setAssigning(true);
    try {
      const res = await api.patch(`/users/${userId}/assignment`, {
        departmentId: assignDeptId,
        academicYearId: assignYearId || undefined,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                departmentId: res.data.user.departmentId,
                academicYearId: res.data.user.academicYearId,
                department: res.data.user.department,
                academicYear: res.data.user.academicYear,
              }
            : u,
        ),
      );
      toast.success("Program assigned");
      setAssigningId(null);
      setAssignDeptId("");
      setAssignYearId("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Failed to assign program");
    } finally {
      setAssigning(false);
    }
  }

  async function handleCleanup() {
    setCleaning(true);
    setCleanupResult(null);
    try {
      const res = await api.delete("/users/inactive");
      setCleanupResult(`✅ ${res.data.message}`);
      await loadUsers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setCleanupResult(`❌ ${err?.response?.data?.message ?? "Cleanup failed"}`);
    } finally {
      setCleaning(false);
      setCleanupConfirm(false);
    }
  }

  const roleGroups = ["SUPER_ADMIN", "ADMIN", "TEACHER", "STUDENT", "GUEST"];
  const hasActiveFilters = Boolean(
    search || roleFilter || statusFilter || deptFilter,
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* -- Header --------------------------------------------- */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">User Management</h1>
          <p className="text-secondary text-sm mt-0.5">
            {total} {hasActiveFilters ? "matching users" : "users"} · sorted by {sortByRole ? "role" : "date"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={() => setCleanupConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.18)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Purge Inactive
            </button>
          )}
          <button
            onClick={() => { setShowCreate(!showCreate); setCreatedResult(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)", boxShadow: "0 0 16px rgba(20,184,166,0.3)" }}
          >
            <Plus className="h-4 w-4" /> Create User
          </button>
        </div>
      </div>

      {/* -- Cleanup confirm ------------------------------------ */}
      <AnimatePresence>
        {cleanupConfirm && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl p-5"
            style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: "#EF4444" }} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-primary mb-1">Purge inactive accounts?</p>
                <p className="text-xs text-secondary mb-4">
                  This permanently deletes <strong>STUDENT and GUEST</strong> accounts that have been
                  inactive (deactivated) for <strong>more than 12 months</strong>. Staff and admin
                  accounts are never affected. This action cannot be undone.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCleanup}
                    disabled={cleaning}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white"
                    style={{ background: "#EF4444" }}
                  >
                    {cleaning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {cleaning ? "Deleting…" : "Yes, delete them"}
                  </button>
                  <button onClick={() => setCleanupConfirm(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-primary transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {cleanupResult && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(45,212,191,0.07)", border: "1px solid rgba(45,212,191,0.15)" }}>
          <p className="text-primary">{cleanupResult}</p>
        </div>
      )}

      {/* -- Create staff panel --------------------------------- */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, y: -8, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="rounded-2xl p-6 space-y-4"
              style={{ background: "rgba(45,212,191,0.04)", border: "1px solid rgba(45,212,191,0.14)" }}
            >
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                <h2 className="text-sm font-semibold text-primary">Create User Account</h2>
              </div>

              {/* Success banner */}
              {createdResult && (
                <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <p className="font-semibold mb-1" style={{ color: "#10B981" }}>✅ Account created — {createdResult.name}</p>
                  <p className="text-secondary text-xs">Email: <span className="font-medium text-primary">{createdResult.email}</span></p>
                  {createdResult.invitationSent ? (
                    <p className="text-muted text-xs mt-1.5">
                      📧 An invitation was emailed to {createdResult.email}. They choose their own
                      password through a one-time link that expires in 48 hours — no password is
                      shown here or sent to you.
                    </p>
                  ) : (
                    <p className="text-muted text-xs mt-1.5">
                      📧 The invitation email could not be sent. Share this secure link with them
                      directly — it lets them set a password once and expires in 48 hours:
                      <br />
                      <span className="font-mono text-[11px] break-all">{createdResult.setupUrl}</span>
                    </p>
                  )}
                  {createdResult.courses !== undefined && (
                    <p className="text-muted text-xs mt-1">
                      {createdResult.courses > 0
                        ? `📚 Assigned to ${createdResult.courses} course${createdResult.courses === 1 ? "" : "s"} — they will appear on the teacher's dashboard at first login.`
                        : "📚 No courses assigned yet — assign them from the course page when the schedule is ready."}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Full Name</label>
                  <GlowInput value={newStaff.fullName} onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })} placeholder="Dr. Aisha Mohammed" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Email Address</label>
                  <GlowInput value={newStaff.email} onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })} type="email" placeholder="aisha@lorcan.edu.et" />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Role</label>
                <div className="flex gap-2 flex-wrap">
                  {creatableRoles.map((r) => (
                    <button
                      key={r}
                      onClick={() => {
                        const nextIsPrivileged = r === "ADMIN" || r === "SUPER_ADMIN";
                        setNewStaff({
                          ...newStaff,
                          role: r,
                          // Admin accounts carry no program — drop any value
                          // picked while another role was selected.
                          ...(nextIsPrivileged ? { departmentId: "", academicYearId: "" } : {}),
                        });
                        setSelectedCourseIds([]);
                      }}
                      className="flex-1 min-w-[7rem] py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={
                        newStaff.role === r
                          ? { background: "linear-gradient(135deg, #147878, #1A9494)", color: "#fff", boxShadow: "0 0 12px var(--teal-glow)" }
                          : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }
                      }
                    >
                      {ROLE_BADGE[r]?.label ?? r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Department / academic year — hidden for admin roles, which
                  carry no program */}
              {!isPrivilegedRole && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">
                      {isStudentRole
                        ? <>Department <span style={{ color: "var(--state-error)" }}>*</span></>
                        : <>Assign Program <span className="text-muted font-normal">(optional)</span></>}
                    </label>
                    <select
                      value={newStaff.departmentId}
                      onChange={(e) => { setNewStaff({ ...newStaff, departmentId: e.target.value, academicYearId: "" }); setSelectedCourseIds([]); }}
                      aria-label="Department"
                      className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary outline-none transition-all"
                      style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.12)" }}
                    >
                      <option value="">{isStudentRole ? "— Select department —" : "— No program assigned —"}</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  {isStudentRole && (
                    <div>
                      <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">
                        Academic Year <span style={{ color: "var(--state-error)" }}>*</span>
                      </label>
                      <select
                        value={newStaff.academicYearId}
                        onChange={(e) => setNewStaff({ ...newStaff, academicYearId: e.target.value })}
                        aria-label="Academic year"
                        disabled={!newStaff.departmentId}
                        className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary outline-none transition-all disabled:opacity-50"
                        style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.12)" }}
                      >
                        <option value="">— Select year —</option>
                        {academicYears.map((y) => (
                          <option key={y.id} value={y.id}>{y.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Teacher course pre-assignment */}
              {newStaff.role === "TEACHER" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-secondary tracking-widest uppercase">
                      Assign Courses{" "}
                      {selectedCourseIds.length > 0
                        ? <span style={{ color: "#2DD4BF" }}>({selectedCourseIds.length} selected)</span>
                        : <span className="text-muted font-normal">(optional)</span>}
                    </label>
                    {selectedCourseIds.length > 0 && (
                      <button
                        onClick={() => setSelectedCourseIds([])}
                        className="text-[10px] font-semibold text-muted hover:text-primary transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {coursesLoading ? (
                    <p className="text-xs text-muted py-3 flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading courses…
                    </p>
                  ) : courses.length === 0 ? (
                    <p className="text-xs text-muted py-2">
                      No courses in the catalog yet — they can be assigned later from the course page.
                    </p>
                  ) : (
                    <>
                      <input
                        value={courseSearch}
                        onChange={(e) => setCourseSearch(e.target.value)}
                        placeholder="Filter courses by title…"
                        aria-label="Filter courses"
                        className="w-full rounded-xl px-3.5 py-2 text-xs text-primary placeholder:text-muted outline-none mb-2"
                        style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.12)" }}
                      />
                      <div
                        className="max-h-52 overflow-y-auto rounded-xl"
                        style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.12)" }}
                      >
                        {visibleCourses.length === 0 ? (
                          <p className="text-xs text-muted px-3 py-3">
                            No courses match{createDeptName ? ` in ${createDeptName}` : ""}.
                          </p>
                        ) : visibleCourses.map((c) => {
                          const taken = Boolean(c.teacher);
                          const checked = selectedCourseIds.includes(c.id);
                          const meta = [
                            c.semester?.academicYear?.department?.name,
                            c.semester?.academicYear?.label,
                            c.semester?.name,
                          ].filter(Boolean).join(" · ");
                          return (
                            <label
                              key={c.id}
                              className={`flex items-start gap-2.5 px-3 py-2 transition-colors ${taken ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}`}
                              style={{ borderTop: "1px solid rgba(45,212,191,0.05)" }}
                              onMouseEnter={(e) => { if (!taken) (e.currentTarget as HTMLElement).style.background = "rgba(45,212,191,0.05)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={taken}
                                onChange={(e) => {
                                  setSelectedCourseIds((prev) =>
                                    e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                                  );
                                }}
                                className="mt-0.5 accent-teal-500"
                              />
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-medium text-primary truncate">{c.title}</span>
                                <span className="block text-[10px] text-muted truncate">
                                  {meta || "—"}
                                  {!c.isPublished && " · draft"}
                                  {taken && ` · already taught by ${c.teacher?.fullName ?? "another teacher"}`}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <p className="text-muted text-[10px] mt-1.5">
                        Courses already assigned to another teacher are disabled — reassign those from the course page if needed.
                      </p>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={handleCreateStaff}
                disabled={creating || !newStaff.fullName.trim() || !newStaff.email.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)", boxShadow: "0 0 16px rgba(20,184,166,0.25)" }}
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                {creating ? "Creating…" : `Create ${newStaff.role} Account`}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* -- Filters + sort ------------------------------------- */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-primary placeholder:text-muted outline-none transition-all"
            style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.1)" }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.4)"; }}
            onBlur={(e) => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.1)"; }}
          />
        </div>

        {/* Role filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          className="px-3.5 py-2.5 rounded-xl text-sm text-primary outline-none transition-all"
          style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.1)" }}
        >
          <option value="">All roles</option>
          {roleGroups.map((r) => <option key={r} value={r}>{ROLE_BADGE[r]?.label ?? r}</option>)}
        </select>

        {/* Account status filter — the login gate, not subscription state */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by account status"
          className="px-3.5 py-2.5 rounded-xl text-sm text-primary outline-none transition-all"
          style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.1)" }}
        >
          <option value="">All account statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>

        {/* Program (department) filter */}
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          aria-label="Filter by program"
          className="px-3.5 py-2.5 rounded-xl text-sm text-primary outline-none transition-all"
          style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.1)" }}
        >
          <option value="">All programs</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={() => { setSearch(""); setRoleFilter(""); setStatusFilter(""); setDeptFilter(""); }}
            className="px-3.5 py-2.5 rounded-xl text-xs font-semibold text-muted hover:text-primary transition-colors"
          >
            Clear filters
          </button>
        )}

        {/* Sort toggle */}
        <button
          onClick={() => setSortByRole((v) => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all"
          style={
            sortByRole
              ? { background: "rgba(45,212,191,0.15)", color: "#2DD4BF", border: "1px solid rgba(45,212,191,0.3)" }
              : { background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid rgba(45,212,191,0.1)" }
          }
        >
          {sortByRole ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          Sort by Role
        </button>
      </div>

      {/* -- Users table ---------------------------------------- */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2DD4BF" }} />
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(45,212,191,0.1)" }}>
          {/* Header */}
          <div
            className="hidden md:grid grid-cols-12 gap-4 px-5 py-3"
            style={{ borderBottom: "1px solid rgba(45,212,191,0.08)", background: "rgba(45,212,191,0.03)" }}
          >
            {["Name / Status", "Email", "Program", "Role", "Actions"].map((h, i) => (
              <span
                key={h}
                className={`text-xs font-semibold text-muted uppercase tracking-widest ${
                  i === 0 ? "col-span-3" : i === 1 ? "col-span-3" : i === 2 ? "col-span-2" : i === 3 ? "col-span-2" : "col-span-2"
                }`}
              >
                {h}
              </span>
            ))}
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-muted text-center py-12">No users match the current filters.</p>
          ) : (
            users.map((user, i) => {
              const badge = ROLE_BADGE[user.role] ?? { label: user.role, bg: "rgba(100,116,139,0.1)", color: "#94A3B8" };
              return (
                <div
                  key={user.id}
                  className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-4 items-start transition-colors md:grid-cols-12 md:gap-4 md:px-5 md:py-3.5 md:items-center"
                  style={{ borderTop: i > 0 ? "1px solid rgba(45,212,191,0.05)" : undefined }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(45,212,191,0.02)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  {/* Name */}
                  <div className="col-span-2 min-w-0 md:col-span-3">
                    <p className="text-sm font-medium text-primary truncate">{user.fullName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] font-medium ${user.isEmailVerified ? "text-success" : "text-warning"}`}>
                        {user.isEmailVerified ? "✓ Verified" : "⚠ Unverified"}
                      </span>
                      {!user.isActive && (
                        <span className="text-[10px] font-medium" style={{ color: "#EF4444" }}>· Inactive</span>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <p className="col-span-2 text-xs text-secondary truncate md:col-span-3">{user.email}</p>

                  {/* Program — click to assign/reassign. Admin accounts
                      carry no program, so there is nothing to edit. */}
                  <div className="col-span-1 min-w-0 md:col-span-2">
                    {privileged(user.role) ? (
                      <span
                        className="text-xs text-muted truncate block"
                        title="Programs apply to students and teachers only"
                      >
                        {user.department?.name ?? <span className="opacity-40">—</span>}
                      </span>
                    ) : assigningId === user.id ? (
                      <div className="flex flex-col gap-1">
                        <select
                          value={assignDeptId}
                          onChange={(e) => { setAssignDeptId(e.target.value); setAssignYearId(""); }}
                          className="text-xs rounded-lg px-2 py-1 w-full outline-none"
                          style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.25)", color: "var(--text-primary)" }}
                        >
                          <option value="">— Dept —</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <select
                          value={assignYearId}
                          onChange={(e) => setAssignYearId(e.target.value)}
                          disabled={!assignDeptId}
                          className="text-xs rounded-lg px-2 py-1 w-full outline-none disabled:opacity-50"
                          style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.25)", color: "var(--text-primary)" }}
                        >
                          <option value="">— Year —</option>
                          {effectiveAssignYears.map((y) => (
                            <option key={y.id} value={y.id}>{y.label}</option>
                          ))}
                        </select>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleAssignDepartment(user.id)}
                            disabled={!assignDeptId || assigning}
                            className="text-[10px] px-2 py-0.5 rounded-md font-semibold text-white disabled:opacity-50"
                            style={{ background: "#147878" }}
                          >
                            {assigning ? "…" : "Save"}
                          </button>
                          <button
                            onClick={() => { setAssigningId(null); setAssignDeptId(""); setAssignYearId(""); }}
                            className="text-[10px] px-2 py-0.5 rounded-md font-semibold"
                            style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAssigningId(user.id);
                          setAssignDeptId(user.departmentId ?? "");
                          setAssignYearId(user.academicYearId ?? "");
                        }}
                        title="Click to assign program"
                        className="text-left w-full hover:opacity-75 transition-opacity"
                      >
                        <span className="text-xs text-muted truncate block">
                          {user.department?.name ?? <span className="opacity-40">—</span>}
                        </span>
                        {user.academicYear && (
                          <span className="text-[10px] block" style={{ color: "var(--text-muted)", opacity: 0.65 }}>
                            {user.academicYear.label}
                          </span>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Role badge + selector */}
                  <div className="col-span-1 md:col-span-2">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      aria-label={`Role for ${user.fullName}`}
                      disabled={!canModify(user)}
                      className="text-xs font-semibold px-2 py-1 rounded-lg outline-none transition-all disabled:opacity-70 disabled:cursor-not-allowed enabled:cursor-pointer"
                      style={{ background: badge.bg, color: badge.color, border: "none" }}
                    >
                      {Array.from(new Set([user.role, ...assignableRoles])).map((r) => (
                        <option key={r} value={r}>{ROLE_BADGE[r]?.label ?? r}</option>
                      ))}
                    </select>
                    {/* Anatomy reviewer access — TEACHER-only capability.
                        Every teacher gets it by default; admins can revoke. */}
                    {user.role === "TEACHER" && canModify(user) && (
                      <button
                        type="button"
                        onClick={() => handleReviewerToggle(user)}
                        disabled={reviewerBusyId === user.id}
                        aria-pressed={Boolean(user.isAnatomyReviewer)}
                        title={
                          user.isAnatomyReviewer
                            ? "Anatomy reviewer access granted — click to revoke"
                            : "Anatomy reviewer access revoked — click to grant"
                        }
                        className="mt-1 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md transition-all disabled:opacity-50"
                        style={
                          user.isAnatomyReviewer
                            ? { background: "rgba(45,212,191,0.12)", color: "#2DD4BF" }
                            : { background: "rgba(100,116,139,0.12)", color: "#94A3B8" }
                        }
                        onMouseEnter={(e) => { if (reviewerBusyId !== user.id) (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      >
                        {reviewerBusyId === user.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : user.isAnatomyReviewer ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <ShieldOff className="h-3 w-3" />
                        )}
                        {user.isAnatomyReviewer ? "Reviewer" : "No review"}
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex flex-wrap items-center gap-2 md:flex-nowrap">
                    <button
                      onClick={() => handleStatusToggle(user.id, user.isActive)}
                      disabled={!canModify(user)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={
                        user.isActive
                          ? { background: "rgba(16,185,129,0.1)", color: "#10B981" }
                          : { background: "rgba(239,68,68,0.1)", color: "#EF4444" }
                      }
                      onMouseEnter={(e) => { if (canModify(user)) (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </button>
                    {canModify(user) && (
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.id}
                        aria-label={`Delete ${user.fullName}`}
                        title="Delete user"
                        className="p-1.5 rounded-lg transition-all disabled:opacity-50"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.2)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.1)"; }}
                      >
                        {deletingId === user.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
