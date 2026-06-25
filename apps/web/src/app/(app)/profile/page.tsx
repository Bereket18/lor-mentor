"use client";

import { useState } from "react";
import { Loader2, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";

export default function ProfilePage() {
  const { user, checkAuth } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!fullName.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/users/me/profile", { fullName: fullName.trim() });
      await checkAuth();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      alert(err?.response?.data?.message ?? "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Profile</h1>
        <p className="text-secondary text-sm">Manage your account details.</p>
      </div>

      <div
        className="rounded-2xl p-6 space-y-5"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
      >
        {/* Avatar placeholder */}
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(45,212,191,0.12)" }}
          >
            <User className="h-6 w-6" style={{ color: "#2DD4BF" }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">{user?.fullName}</p>
            <p className="text-xs text-muted">{user?.email}</p>
            <span
              className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(45,212,191,0.1)", color: "#2DD4BF" }}
            >
              {user?.role}
            </span>
          </div>
        </div>

        {/* Edit full name */}
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">
            Full Name
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-sm text-primary outline-none transition-all"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(45,212,191,0.5)"; }}
            onBlur={(e) => { e.currentTarget.style.border = "1px solid var(--border-default)"; }}
          />
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5 tracking-widest uppercase">
            Email Address
          </label>
          <input
            value={user?.email ?? ""}
            readOnly
            className="w-full rounded-xl px-4 py-2.5 text-sm text-muted outline-none cursor-not-allowed"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !fullName.trim() || fullName === user?.fullName}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
