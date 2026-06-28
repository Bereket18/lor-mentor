"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, BookOpen, GraduationCap, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";

interface CourseProgress {
  courseId: string;
  title: string;
  totalMaterials: number;
  viewedMaterials: number;
  pct: number;
}
interface ProgressData {
  overall: { total: number; viewed: number; pct: number };
  courses: CourseProgress[];
  quizzes: { taken: number; avgPct: number };
}

function Stat({ icon: Icon, label, value, accent }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; value: string; accent: string;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
        style={{ background: "var(--teal-dim)" }}>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </div>
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ProgressData>("/progress/me")
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-24 rounded-2xl skeleton" />
        <div className="h-56 rounded-2xl skeleton" />
      </div>
    );
  }

  const hasData = data && (data.overall.total > 0 || data.quizzes.taken > 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Progress</h1>
        <p className="text-secondary text-sm">Track your study progress across all courses.</p>
      </div>

      {!hasData ? (
        <div className="glass-panel p-12 text-center">
          <BarChart3 className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--teal)", opacity: 0.4 }} />
          <p className="text-secondary text-sm font-medium">No progress data yet</p>
          <p className="text-muted text-xs mt-1">Open course materials and take quizzes — your stats will appear here.</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={BarChart3} label="Overall" value={`${data!.overall.pct}%`} accent="var(--teal)" />
            <Stat icon={BookOpen} label="Materials viewed" value={`${data!.overall.viewed}/${data!.overall.total}`} accent="var(--accent-primary)" />
            <Stat icon={GraduationCap} label="Quiz average" value={data!.quizzes.taken ? `${data!.quizzes.avgPct}%` : "—"} accent="var(--ai-primary)" />
          </div>

          {/* Per-course bars */}
          <div className="glass-panel p-5">
            <h2 className="text-sm font-semibold text-primary mb-4">By course</h2>
            {data!.courses.length === 0 ? (
              <p className="text-sm text-muted">No courses available yet.</p>
            ) : (
              <div className="space-y-4">
                {data!.courses.map((c) => (
                  <Link key={c.courseId} href={`/courses/${c.courseId}`} className="block group">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-primary truncate group-hover:opacity-80 flex items-center gap-1.5">
                        {c.pct === 100 && <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--state-success)" }} />}
                        {c.title}
                      </span>
                      <span className="text-xs text-muted flex-shrink-0 ml-2">
                        {c.viewedMaterials}/{c.totalMaterials} · {c.pct}%
                      </span>
                    </div>
                    <div className="progress-track h-1.5">
                      <div className="progress-fill h-1.5" style={{ width: `${c.pct}%` }} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
