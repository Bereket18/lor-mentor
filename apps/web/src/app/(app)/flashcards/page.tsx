"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Layers, ArrowLeft, Check, RotateCcw, Loader2, Sparkles, ChevronRight,
} from "lucide-react";
import api from "@/lib/api";

interface Course { id: string; title: string }
interface SetSummary {
  id: string; title: string; materialTitle: string;
  totalCards: number; knownCount: number;
}
interface StudyCard { id: string; front: string; back: string; isKnown: boolean | null }
interface StudySet { id: string; title: string; cards: StudyCard[] }

export default function FlashcardsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);

  const [study, setStudy] = useState<StudySet | null>(null);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Course[]>("/courses/my-year")
      .then((r) => {
        const list = r.data ?? [];
        setCourses(list);
        if (list.length) setCourseId(list[0].id);
        else setLoadingSets(false);
      })
      .catch(() => { setCourses([]); setLoadingSets(false); });
  }, []);

  const loadSets = useCallback((id: string) => {
    if (!id) return;
    api.get<SetSummary[]>(`/flashcards?courseId=${id}`)
      .then((r) => setSets(r.data ?? []))
      .catch(() => setSets([]))
      .finally(() => setLoadingSets(false));
  }, []);

  useEffect(() => { loadSets(courseId); }, [courseId, loadSets]);

  function openSet(id: string) {
    setLoadingStudy(true);
    setStudy(null);
    setIndex(0);
    setFlipped(false);
    api.get<StudySet>(`/flashcards/${id}`)
      .then((r) => setStudy(r.data))
      .catch(() => setStudy(null))
      .finally(() => setLoadingStudy(false));
  }

  async function mark(isKnown: boolean) {
    if (!study) return;
    const card = study.cards[index];
    setSaving(true);
    try {
      await api.post(`/flashcards/${study.id}/review`, { cardId: card.id, isKnown });
      setStudy((s) => s ? {
        ...s,
        cards: s.cards.map((c, i) => i === index ? { ...c, isKnown } : c),
      } : s);
      setFlipped(false);
      setIndex((i) => Math.min(i + 1, study.cards.length));
    } catch {
      alert("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // -- Study mode -------------------------------------------
  if (study || loadingStudy) {
    const total = study?.cards.length ?? 0;
    const done = index >= total && total > 0;
    const knownCount = study?.cards.filter((c) => c.isKnown).length ?? 0;
    const card = study?.cards[index];

    return (
      <div className="max-w-xl mx-auto space-y-5">
        <button type="button" onClick={() => { setStudy(null); loadSets(courseId); }}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to sets
        </button>

        {loadingStudy || !study ? (
          <div className="h-64 rounded-2xl skeleton" />
        ) : done ? (
          <div className="glass-panel p-10 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "var(--teal-dim)" }}>
              <Check className="h-7 w-7" style={{ color: "var(--teal)" }} />
            </div>
            <h2 className="font-display text-xl font-bold text-primary mb-1">Set complete!</h2>
            <p className="text-secondary text-sm mb-5">
              You knew {knownCount} of {total} cards.
            </p>
            <button type="button" onClick={() => { setIndex(0); setFlipped(false); }}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}>
              <RotateCcw className="h-4 w-4" /> Study again
            </button>
          </div>
        ) : (
          <>
            {/* Progress */}
            <div>
              <div className="flex items-center justify-between text-xs text-muted mb-2">
                <span>{study.title}</span>
                <span>{index + 1} / {total}</span>
              </div>
              <div className="progress-track h-1.5">
                <div className="progress-fill h-1.5" style={{ width: `${(index / total) * 100}%` }} />
              </div>
            </div>

            {/* Flip card */}
            <button type="button" onClick={() => setFlipped((f) => !f)}
              className="glass-panel glass-panel-hover w-full min-h-[16rem] p-8 flex flex-col items-center justify-center text-center">
              <span className="text-[11px] uppercase tracking-widest mb-3"
                style={{ color: flipped ? "var(--teal)" : "var(--text-muted)" }}>
                {flipped ? "Answer" : "Question"}
              </span>
              <p className="text-lg font-medium text-primary whitespace-pre-wrap">
                {flipped ? card?.back : card?.front}
              </p>
              {!flipped && (
                <span className="text-xs text-muted mt-4 flex items-center gap-1">
                  <RotateCcw className="h-3 w-3" /> Tap to flip
                </span>
              )}
            </button>

            {/* Known / unknown */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => mark(false)} disabled={saving}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: "rgba(245,158,11,0.12)", color: "var(--state-warning)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <RotateCcw className="h-4 w-4" /> Still learning
              </button>
              <button type="button" onClick={() => mark(true)} disabled={saving}
                className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: "rgba(16,185,129,0.12)", color: "var(--state-success)", border: "1px solid rgba(16,185,129,0.2)" }}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} I know this
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // -- Set list ---------------------------------------------
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Flashcards</h1>
        <p className="text-secondary text-sm">AI-generated flashcards from your course materials.</p>
      </div>

      {courses.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {courses.map((c) => (
            <button key={c.id} type="button"
              onClick={() => { if (c.id !== courseId) setLoadingSets(true); setCourseId(c.id); }}
              className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={courseId === c.id
                ? { background: "var(--teal-dim)", color: "var(--teal)", border: "1px solid var(--teal-glow)" }
                : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
              {c.title}
            </button>
          ))}
        </div>
      )}

      {courses.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Layers className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--teal)", opacity: 0.4 }} />
          <p className="text-secondary text-sm font-medium">No courses yet</p>
          <p className="text-muted text-xs mt-1">Flashcards appear once your courses have materials.</p>
        </div>
      ) : loadingSets ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>
      ) : sets.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Sparkles className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--ai-primary)", opacity: 0.5 }} />
          <p className="text-secondary text-sm font-medium">No flashcards yet</p>
          <p className="text-muted text-xs mt-1">
            Flashcards are generated automatically when a teacher uploads PDF materials.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sets.map((s) => {
            const pct = s.totalCards ? Math.round((s.knownCount / s.totalCards) * 100) : 0;
            return (
              <button key={s.id} type="button" onClick={() => openSet(s.id)}
                className="glass-panel glass-panel-hover w-full text-left p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--teal-dim)" }}>
                  <Layers className="h-5 w-5" style={{ color: "var(--teal)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary truncate">{s.title}</p>
                  <p className="text-xs text-muted truncate">{s.materialTitle}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="w-24 progress-track h-1"><div className="progress-fill h-1" style={{ width: `${pct}%` }} /></div>
                    <span className="text-[11px] text-muted">{s.knownCount}/{s.totalCards} known</span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
