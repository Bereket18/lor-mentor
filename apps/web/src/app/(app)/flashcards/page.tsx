"use client";

import { Layers } from "lucide-react";

export default function FlashcardsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Flashcards</h1>
        <p className="text-secondary text-sm">AI-generated flashcards from your course materials.</p>
      </div>
      <div
        className="rounded-2xl p-16 text-center"
        style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
      >
        <Layers className="h-10 w-10 mx-auto mb-4" style={{ color: "rgba(45,212,191,0.3)" }} />
        <p className="text-secondary text-sm font-medium">No flashcards yet</p>
        <p className="text-muted text-xs mt-1">Flashcards are auto-generated when a teacher uploads a PDF. Check back after your teacher adds materials.</p>
      </div>
    </div>
  );
}
