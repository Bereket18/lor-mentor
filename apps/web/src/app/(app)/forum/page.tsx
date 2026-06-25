"use client";

import { MessageSquare } from "lucide-react";

export default function ForumPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Forum</h1>
        <p className="text-secondary text-sm">Discuss course material with your classmates.</p>
      </div>
      <div
        className="rounded-2xl p-16 text-center"
        style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
      >
        <MessageSquare className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(45,212,191,0.3)" }} />
        <p className="text-secondary text-sm font-medium">Forum coming soon</p>
        <p className="text-muted text-xs mt-1">Discussion boards for each course will appear here.</p>
      </div>
    </div>
  );
}
