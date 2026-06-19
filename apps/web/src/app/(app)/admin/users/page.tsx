"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Loader2, Shield, UserCheck } from "lucide-react";
import api from "@/lib/api";
import { Select } from "radix-ui";

interface User {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
}

const roleColors: Record<string, string> = {
  STUDENT: "text-secondary",
  TEACHER: "text-teal",
  ADMIN: "text-accent",
  SUPER_ADMIN: "text-ai",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newStaff, setNewStaff] = useState({
    fullName: "",
    email: "",
    role: "TEACHER" as "TEACHER" | "ADMIN",
  });
  const [createdPassword, setCreatedPassword] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.get(`/users?search=${search}&limit=50`);
      setUsers(res.data.users);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateStaff() {
    if (!newStaff.fullName || !newStaff.email) return;
    setCreating(true);
    try {
      const res = await api.post("/users/create-staff", newStaff);
      setCreatedPassword(res.data.temporaryPassword);
      setNewStaff({ fullName: "", email: "", role: "TEACHER" });
      await loadUsers();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Failed to create account");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    await api.patch(`/users/${userId}/role`, { role });
    await loadUsers();
  }

  async function handleStatusToggle(userId: string, isActive: boolean) {
    await api.patch(`/users/${userId}/status`, { isActive: !isActive });
    await loadUsers();
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-primary">
          User Management
        </h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm
            font-medium text-white transition-colors"
          style={{ backgroundColor: "#147878" }}
        >
          <Plus className="h-4 w-4" />
          Create Staff Account
        </button>
      </div>

      {/* Create staff panel */}
      {showCreate && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface border border-default rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-primary">
              Create Teacher or Admin Account
            </h2>
          </div>

          {createdPassword && (
            <div
              className="bg-green-500/10 border border-green-500/20
              rounded-xl p-4 text-sm"
            >
              <p className="text-green-400 font-medium mb-1">
                Account created successfully
              </p>
              <p className="text-secondary">
                Temporary password:{" "}
                <span className="font-mono font-bold text-primary">
                  {createdPassword}
                </span>
              </p>
              <p className="text-xs text-muted mt-1">
                Share this with the staff member. They should change it on first
                login.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5 tracking-wide">
                FULL NAME
              </label>
              <input
                value={newStaff.fullName}
                onChange={(e) =>
                  setNewStaff({ ...newStaff, fullName: e.target.value })
                }
                placeholder="Dr. Aisha Mohammed"
                className="w-full bg-elevated border border-default rounded-xl
                  px-4 py-2.5 text-sm text-primary placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-secondary mb-1.5 tracking-wide">
                EMAIL ADDRESS
              </label>
              <input
                value={newStaff.email}
                onChange={(e) =>
                  setNewStaff({ ...newStaff, email: e.target.value })
                }
                placeholder="aisha@lorcan.edu.et"
                className="w-full bg-elevated border border-default rounded-xl
                  px-4 py-2.5 text-sm text-primary placeholder:text-muted
                  focus:outline-none focus:border-accent focus:ring-2
                  focus:ring-accent/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5 tracking-wide">
              ROLE
            </label>
            <div className="flex gap-2">
              {(["TEACHER", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setNewStaff({ ...newStaff, role: r })}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors
                    ${
                      newStaff.role === r
                        ? "bg-accent text-white"
                        : "bg-elevated text-secondary hover:text-primary"
                    }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreateStaff}
            disabled={creating || !newStaff.fullName || !newStaff.email}
            className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl
              text-sm font-medium transition-colors disabled:opacity-50"
            style={{ backgroundColor: "#147878" }}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="h-4 w-4" />
            )}
            {creating ? "Creating..." : `Create ${newStaff.role} Account`}
          </button>
        </motion.div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          loadUsers();
        }}
        placeholder="Search by name or email..."
        className="w-full bg-surface border border-default rounded-xl px-4
          py-2.5 text-sm text-primary placeholder:text-muted
          focus:outline-none focus:border-accent focus:ring-2
          focus:ring-accent/20 transition-all"
      />

      {/* Users table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : (
        <div className="bg-surface border border-default rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-default">
            <span className="col-span-4 text-xs font-medium text-muted uppercase tracking-wide">
              Name
            </span>
            <span className="col-span-4 text-xs font-medium text-muted uppercase tracking-wide">
              Email
            </span>
            <span className="col-span-2 text-xs font-medium text-muted uppercase tracking-wide">
              Role
            </span>
            <span className="col-span-2 text-xs font-medium text-muted uppercase tracking-wide">
              Actions
            </span>
          </div>

          {users.map((user, i) => (
            <div
              key={user.id}
              className={`grid grid-cols-12 gap-4 px-5 py-3.5 items-center
                ${i < users.length - 1 ? "border-b border-subtle" : ""}`}
            >
              <div className="col-span-4 min-w-0">
                <p className="text-sm font-medium text-primary truncate">
                  {user.fullName}
                </p>
                <p className="text-xs text-muted">
                  {user.isEmailVerified ? "Verified" : "Unverified"}
                  {!user.isActive && " · Inactive"}
                </p>
              </div>

              <p className="col-span-4 text-sm text-secondary truncate">
                {user.email}
              </p>

              <div className="col-span-2">
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  className={`text-xs font-medium bg-transparent
                    focus:outline-none cursor-pointer ${roleColors[user.role] ?? "text-secondary"}`}
                >
                  {["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <button
                  onClick={() => handleStatusToggle(user.id, user.isActive)}
                  className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors
                    ${
                      user.isActive
                        ? "text-green-400 bg-green-500/10 hover:bg-green-500/20"
                        : "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                    }`}
                >
                  {user.isActive ? "Active" : "Inactive"}
                </button>
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <p className="text-sm text-muted text-center py-12">
              No users found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
