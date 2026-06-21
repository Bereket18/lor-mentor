"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Loader2, Shield, UserCheck, Trash2,
  ChevronUp, ChevronDown, Search, AlertTriangle,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Department { id: string; name: string }

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  department?: { id: string; name: string } | null;
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
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [users,       setUsers]       = useState<User[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [roleFilter,  setRoleFilter]  = useState("");
  const [sortByRole,  setSortByRole]  = useState(false);
  const [showCreate,  setShowCreate]  = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newStaff, setNewStaff] = useState({
    fullName: "", email: "", role: "TEACHER" as "TEACHER" | "ADMIN", departmentId: "",
  });
  const [createdResult,  setCreatedResult]  = useState<{ name: string; email: string; password: string } | null>(null);
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [cleaning,       setCleaning]       = useState(false);
  const [cleanupResult,  setCleanupResult]  = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, limit: "100", ...(roleFilter ? { role: roleFilter } : {}), ...(sortByRole ? { sortBy: "role" } : {}) });
      const res = await api.get(`/users?${params}`);
      setUsers(res.data.users ?? []);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, sortByRole]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadUsers(); }, [loadUsers]);

  useEffect(() => {
    api.get("/departments").then((r) => setDepartments(r.data ?? []));
  }, []);

  async function handleCreateStaff() {
    if (!newStaff.fullName.trim() || !newStaff.email.trim()) return;
    setCreating(true);
    setCreatedResult(null);
    try {
      const payload: Record<string, string> = {
        fullName: newStaff.fullName,
        email: newStaff.email,
        role: newStaff.role,
      };
      if (newStaff.departmentId) payload.departmentId = newStaff.departmentId;
      const res = await api.post("/users/create-staff", payload);
      setCreatedResult({ name: res.data.user.fullName, email: res.data.user.email, password: res.data.temporaryPassword });
      setNewStaff({ fullName: "", email: "", role: "TEACHER", departmentId: "" });
      await loadUsers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await api.patch(`/users/${userId}/role`, { role });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role } : u));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Failed to change role");
    }
  }

  async function handleStatusToggle(userId: string, isActive: boolean) {
    try {
      await api.patch(`/users/${userId}/status`, { isActive: !isActive });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, isActive: !isActive } : u));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Failed to update status");
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

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-primary">User Management</h1>
          <p className="text-secondary text-sm mt-0.5">{users.length} users · sorted by {sortByRole ? "role" : "date"}</p>
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
            <Plus className="h-4 w-4" /> Create Staff
          </button>
        </div>
      </div>

      {/* ── Cleanup confirm ──────────────────────────────────── */}
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

      {/* ── Create staff panel ───────────────────────────────── */}
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
                <h2 className="text-sm font-semibold text-primary">Create Teacher or Admin Account</h2>
              </div>

              {/* Success banner */}
              {createdResult && (
                <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <p className="font-semibold mb-1" style={{ color: "#10B981" }}>✅ Account created — {createdResult.name}</p>
                  <p className="text-secondary text-xs">Email: <span className="font-medium text-primary">{createdResult.email}</span></p>
                  <p className="text-secondary text-xs mt-0.5">
                    Temporary password: <span className="font-mono font-bold text-primary px-1.5 py-0.5 rounded" style={{ background: "rgba(45,212,191,0.1)" }}>{createdResult.password}</span>
                  </p>
                  <p className="text-muted text-xs mt-1.5">Share this with the staff member — they should change it on first login.</p>
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

              <div className="grid grid-cols-2 gap-4">
                {/* Role */}
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">Role</label>
                  <div className="flex gap-2">
                    {(["TEACHER", "ADMIN"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setNewStaff({ ...newStaff, role: r })}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                        style={
                          newStaff.role === r
                            ? { background: "linear-gradient(135deg, #147878, #1A9494)", color: "#fff", boxShadow: "0 0 12px rgba(45,212,191,0.25)" }
                            : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(45,212,191,0.1)" }
                        }
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Program assignment */}
                <div>
                  <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">
                    Assign Program <span className="text-muted font-normal">(optional)</span>
                  </label>
                  <select
                    value={newStaff.departmentId}
                    onChange={(e) => setNewStaff({ ...newStaff, departmentId: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm text-primary outline-none transition-all"
                    style={{ background: "var(--bg-elevated)", border: "1px solid rgba(45,212,191,0.12)" }}
                  >
                    <option value="">— No program assigned —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

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

      {/* ── Filters + sort ───────────────────────────────────── */}
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
          className="px-3.5 py-2.5 rounded-xl text-sm text-primary outline-none transition-all"
          style={{ background: "var(--bg-surface)", border: "1px solid rgba(45,212,191,0.1)" }}
        >
          <option value="">All roles</option>
          {roleGroups.map((r) => <option key={r} value={r}>{ROLE_BADGE[r]?.label ?? r}</option>)}
        </select>

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

      {/* ── Users table ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2DD4BF" }} />
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(45,212,191,0.1)" }}>
          {/* Header */}
          <div
            className="grid grid-cols-12 gap-4 px-5 py-3"
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
            <p className="text-sm text-muted text-center py-12">No users found.</p>
          ) : (
            users.map((user, i) => {
              const badge = ROLE_BADGE[user.role] ?? { label: user.role, bg: "rgba(100,116,139,0.1)", color: "#94A3B8" };
              return (
                <div
                  key={user.id}
                  className="grid grid-cols-12 gap-4 px-5 py-3.5 items-center transition-colors"
                  style={{ borderTop: i > 0 ? "1px solid rgba(45,212,191,0.05)" : undefined }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(45,212,191,0.02)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  {/* Name */}
                  <div className="col-span-3 min-w-0">
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
                  <p className="col-span-3 text-xs text-secondary truncate">{user.email}</p>

                  {/* Program */}
                  <p className="col-span-2 text-xs text-muted truncate">
                    {user.department?.name ?? <span className="opacity-40">—</span>}
                  </p>

                  {/* Role badge + selector */}
                  <div className="col-span-2">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      aria-label={`Role for ${user.fullName}`}
                      className="text-xs font-semibold px-2 py-1 rounded-lg outline-none cursor-pointer transition-all"
                      style={{ background: badge.bg, color: badge.color, border: "none" }}
                    >
                      {roleGroups.map((r) => (
                        <option key={r} value={r}>{ROLE_BADGE[r]?.label ?? r}</option>
                      ))}
                    </select>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center gap-2">
                    <button
                      onClick={() => handleStatusToggle(user.id, user.isActive)}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                      style={
                        user.isActive
                          ? { background: "rgba(16,185,129,0.1)", color: "#10B981" }
                          : { background: "rgba(239,68,68,0.1)", color: "#EF4444" }
                      }
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </button>
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
