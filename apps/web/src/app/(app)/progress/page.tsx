"use client";

import { BarChart3 } from "lucide-react";

export default function ProgressPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Progress</h1>
        <p className="text-secondary text-sm">Track your study progress across all courses.</p>
      </div>
      <div
        className="rounded-2xl p-16 text-center"
        style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
      >
        <BarChart3 className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(45,212,191,0.3)" }} />
        <p className="text-secondary text-sm font-medium">No progress data yet</p>
        <p className="text-muted text-xs mt-1">Your study statistics will appear here as you complete materials and quizzes.</p>
      </div>
    </div>
  );
}
