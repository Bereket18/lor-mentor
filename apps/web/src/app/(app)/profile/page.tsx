"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2, User, Mail, Phone, ShieldCheck, ShieldAlert, CalendarDays,
  Building2, GraduationCap, CreditCard, BookOpen, ArrowRight, Layers,
  Download, KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import type { FullProfile } from "@/types";

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return "—";
  }
}

// Status chip colors driven by semantic state tokens
function statusStyle(status: string): React.CSSProperties {
  const s = status.toUpperCase();
  if (s === "ACTIVE" || s === "APPROVED")
    return { background: "rgba(16,185,129,0.14)", color: "var(--state-success)" };
  if (s === "PENDING")
    return { background: "rgba(245,158,11,0.14)", color: "var(--state-warning)" };
  return { background: "rgba(239,68,68,0.14)", color: "var(--state-error)" };
}

function Row({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--teal-dim)" }}
      >
        <Icon className="h-4 w-4" style={{ color: "var(--teal)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
        <div className="text-sm font-medium text-primary truncate">{value}</div>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-5">
      <h2 className="text-sm font-semibold text-primary mb-2">{title}</h2>
      <div className="divide-y" style={{ borderColor: "var(--border-default)" }}>
        {children}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, checkAuth } = useAuth();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<{ user: FullProfile }>("/users/me/full")
      .then((r) => {
        if (!active) return;
        setProfile(r.data.user);
        setFullName(r.data.user.fullName);
      })
      .catch(() => active && setProfile(null))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  async function handleSave() {
    if (!fullName.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      await api.patch("/users/me/profile", { fullName: fullName.trim() });
      await checkAuth();
      setProfile((p) => (p ? { ...p, fullName: fullName.trim() } : p));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to update profile";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadReceipt(paymentId: string) {
    try {
      const res = await api.get(`/payments/${paymentId}/document`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      window.open(url, "_blank");
    } catch {
      toast.error("Receipt is not available yet.");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (pw.next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    setChangingPw(true);
    try {
      await api.patch("/users/me/password", {
        currentPassword: pw.current,
        newPassword: pw.next,
      });
      toast.success("Password updated");
      setPw({ current: "", next: "", confirm: "" });
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to change password",
      );
    } finally {
      setChangingPw(false);
    }
  }

  const role = profile?.role ?? user?.role;
  const isStudent = role === "STUDENT";
  const isTeacher = role === "TEACHER";

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="h-40 rounded-2xl skeleton mb-4" />
        <div className="h-56 rounded-2xl skeleton" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Profile</h1>
        <p className="text-secondary text-sm">Your account and academic details.</p>
      </div>

      {/* -- Identity header ----------------------------------- */}
      <div className="glass-panel p-6 flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #147878 0%, #1A9494 100%)",
            boxShadow: "0 0 20px var(--teal-glow)",
          }}
        >
          <User className="h-7 w-7 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-primary truncate">{profile?.fullName}</p>
          <p className="text-sm text-secondary truncate">{profile?.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--teal-dim)", color: "var(--teal)" }}
            >
              {role}
            </span>
            {profile?.isEmailVerified ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                style={statusStyle("ACTIVE")}>
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                style={statusStyle("REJECTED")}>
                <ShieldAlert className="h-3 w-3" /> Unverified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* -- Account (all roles) ------------------------------- */}
      <SectionCard title="Account">
        <Row icon={User} label="Full name" value={
          <div className="flex items-center gap-2 pt-1">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-label="Full name"
              placeholder="Your full name"
              className="flex-1 rounded-lg px-3 py-2 text-sm text-primary outline-none transition-all"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
              onFocus={(e) => { e.currentTarget.style.border = "1px solid var(--teal)"; }}
              onBlur={(e) => { e.currentTarget.style.border = "1px solid var(--border-default)"; }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !fullName.trim() || fullName === profile?.fullName}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {saving ? "Saving" : saved ? "✓ Saved" : "Save"}
            </button>
          </div>
        } />
        <Row icon={Mail} label="Email" value={profile?.email} />
        <Row icon={Phone} label="Phone" value={profile?.phoneNumber || "Not set"} />
        <Row icon={CalendarDays} label="Member since" value={formatDate(profile?.createdAt)} />
      </SectionCard>

      {/* -- Security (change password) ------------------------ */}
      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="h-4 w-4" style={{ color: "var(--teal)" }} />
          <h2 className="text-sm font-semibold text-primary">Change password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
          {(
            [
              ["current", "Current password", "current-password"],
              ["next", "New password", "new-password"],
              ["confirm", "Confirm new password", "new-password"],
            ] as const
          ).map(([key, label, autoComplete]) => (
            <div key={key}>
              <label className="block text-[11px] uppercase tracking-wider text-muted mb-1">
                {label}
              </label>
              <input
                type="password"
                autoComplete={autoComplete}
                value={pw[key]}
                onChange={(e) => setPw((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full rounded-lg px-3 py-2 text-sm text-primary outline-none transition-all"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-default)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = "1px solid var(--teal)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid var(--border-default)";
                }}
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={
              changingPw || !pw.current || !pw.next || !pw.confirm
            }
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}
          >
            {changingPw ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {changingPw ? "Updating" : "Update password"}
          </button>
        </form>
      </div>

      {/* -- Academic (student) -------------------------------- */}
      {isStudent && (
        <SectionCard title="Academic">
          <Row icon={Building2} label="Department" value={profile?.department?.name || "Not assigned"} />
          <Row icon={GraduationCap} label="Academic year" value={profile?.academicYear?.label || "Not assigned"} />
          <Row icon={Layers} label="Semesters" value={
            profile?.academicYear?.semesters?.length
              ? profile.academicYear.semesters.map((s) => s.name).join(" · ")
              : "—"
          } />
        </SectionCard>
      )}

      {/* -- Subscription & payments (student) ----------------- */}
      {isStudent && (
        <div className="glass-panel p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-primary">Subscription</h2>
            {!profile?.subscription && (
              <Link href="/pricing" className="text-xs font-semibold inline-flex items-center gap-1"
                style={{ color: "var(--teal)" }}>
                Subscribe <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>

          {profile?.subscription ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--teal-dim)" }}>
                  <CreditCard className="h-4 w-4" style={{ color: "var(--teal)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary">{profile.subscription.plan.name}</p>
                  <p className="text-xs text-muted">
                    {formatDate(profile.subscription.startDate)} – {formatDate(profile.subscription.endDate)}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full"
                  style={statusStyle(profile.subscription.status)}>
                  {profile.subscription.status}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No active subscription. Subscribe to unlock all course materials.</p>
          )}

          {profile?.payments && profile.payments.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-default)" }}>
              <p className="text-[11px] uppercase tracking-wider text-muted mb-2">Recent payments</p>
              <div className="space-y-2">
                {profile.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-secondary truncate">
                      {p.plan?.name ?? "Payment"} · {formatDate(p.createdAt)}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.status === "APPROVED" && (
                        <button
                          type="button"
                          onClick={() => downloadReceipt(p.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold transition-colors"
                          style={{ color: "var(--teal)" }}
                        >
                          <Download className="h-3 w-3" /> Receipt
                        </button>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={statusStyle(p.status)}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* -- Teaching (teacher) -------------------------------- */}
      {isTeacher && (
        <div className="glass-panel p-5">
          <h2 className="text-sm font-semibold text-primary mb-3">Assigned Courses</h2>
          {profile?.teacherCourses && profile.teacherCourses.length > 0 ? (
            <div className="space-y-2">
              {profile.teacherCourses.map((c) => (
                <Link key={c.id} href="/teacher/courses">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
                    style={{ border: "1px solid var(--border-default)" }}>
                    <BookOpen className="h-4 w-4 flex-shrink-0" style={{ color: "var(--teal)" }} />
                    <span className="flex-1 text-sm font-medium text-primary truncate">{c.title}</span>
                    <span className="text-xs text-muted">{c._count.materials} materials</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={statusStyle(c.isPublished ? "ACTIVE" : "PENDING")}>
                      {c.isPublished ? "Published" : "Draft"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No courses assigned yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
