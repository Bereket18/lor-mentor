"use client";

import { BarChart3 } from "lucide-react";

export default function TeacherAnalyticsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Analytics</h1>
        <p className="text-secondary text-sm">Student engagement and progress data for your courses.</p>
      </div>

      <div
        className="rounded-2xl p-16 text-center"
        style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
      >
        <BarChart3 className="h-12 w-12 mx-auto mb-4" style={{ color: "rgba(45,212,191,0.3)" }} />
        <p className="text-secondary text-sm font-medium">Analytics coming in Sprint 5</p>
        <p className="text-muted text-xs mt-1">
          Student engagement metrics, quiz scores, and progress tracking will appear here.
        </p>
      </div>
    </div>
  );
}
