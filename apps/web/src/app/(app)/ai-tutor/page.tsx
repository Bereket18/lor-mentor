"use client";

import { Bot } from "lucide-react";

export default function AiTutorPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">AI Tutor</h1>
        <p className="text-secondary text-sm">Your personalised AI study assistant — coming soon.</p>
      </div>
      <div
        className="rounded-2xl p-16 text-center"
        style={{ border: "1px dashed rgba(167,139,250,0.25)" }}
      >
        <Bot className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(167,139,250,0.4)" }} />
        <p className="text-secondary text-sm font-medium">AI Tutor is under development</p>
        <p className="text-muted text-xs mt-1">Ask questions about your course material using Gemini AI.</p>
      </div>
    </div>
  );
}
