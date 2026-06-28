"use client";

import { useEffect, useState, useCallback } from "react";
import {
  GraduationCap, ArrowLeft, Check, X, Loader2, RotateCcw, ChevronRight, Trophy,
} from "lucide-react";
import api from "@/lib/api";

interface Course { id: string; title: string }
interface QuizSummary {
  id: string; title: string; questionCount: number;
  lastAttempt: { score: number; totalQ: number; completedAt: string } | null;
}
interface QuizQuestion { id: string; text: string; options: string[] }
interface QuizDetail { id: string; title: string; questions: QuizQuestion[] }
interface QResult {
  questionId: string; selected: string | null; correctOption: string;
  isCorrect: boolean; explanation: string | null;
}
interface AttemptResult { attemptId: string; score: number; totalQ: number; results: QResult[] }

export default function QuizPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [startedAt, setStartedAt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  useEffect(() => {
    api.get<Course[]>("/courses/my-year")
      .then((r) => {
        const list = r.data ?? [];
        setCourses(list);
        if (list.length) setCourseId(list[0].id);
        else setLoadingList(false);
      })
      .catch(() => { setCourses([]); setLoadingList(false); });
  }, []);

  const loadList = useCallback((id: string) => {
    if (!id) return;
    api.get<QuizSummary[]>(`/quizzes?courseId=${id}`)
      .then((r) => setQuizzes(r.data ?? []))
      .catch(() => setQuizzes([]))
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => { loadList(courseId); }, [courseId, loadList]);

  function startQuiz(id: string) {
    setLoadingQuiz(true);
    setQuiz(null); setResult(null); setAnswers({});
    api.get<QuizDetail>(`/quizzes/${id}`)
      .then((r) => { setQuiz(r.data); setStartedAt(Date.now()); })
      .catch(() => setQuiz(null))
      .finally(() => setLoadingQuiz(false));
  }

  async function submit() {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const timeTaken = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      const payload = {
        timeTaken,
        answers: Object.entries(answers).map(([questionId, selected]) => ({ questionId, selected })),
      };
      const r = await api.post<AttemptResult>(`/quizzes/${quiz.id}/attempt`, payload);
      setResult(r.data);
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Results screen ───────────────────────────────────────
  if (result && quiz) {
    const pct = result.totalQ ? Math.round((result.score / result.totalQ) * 100) : 0;
    const byId = new Map(quiz.questions.map((q) => [q.id, q]));
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button type="button" onClick={() => { setQuiz(null); setResult(null); loadList(courseId); }}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to quizzes
        </button>

        <div className="glass-panel p-8 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "var(--teal-dim)" }}>
            <Trophy className="h-7 w-7" style={{ color: "var(--teal)" }} />
          </div>
          <p className="text-3xl font-bold text-primary">{pct}%</p>
          <p className="text-secondary text-sm mt-1">{result.score} of {result.totalQ} correct</p>
          <button type="button" onClick={() => startQuiz(quiz.id)}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all mt-5"
            style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}>
            <RotateCcw className="h-4 w-4" /> Retake quiz
          </button>
        </div>

        <div className="space-y-3">
          {result.results.map((r, i) => {
            const q = byId.get(r.questionId);
            return (
              <div key={r.questionId} className="glass-panel p-5">
                <div className="flex items-start gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: r.isCorrect ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" }}>
                    {r.isCorrect
                      ? <Check className="h-3.5 w-3.5" style={{ color: "var(--state-success)" }} />
                      : <X className="h-3.5 w-3.5" style={{ color: "var(--state-error)" }} />}
                  </div>
                  <p className="text-sm font-medium text-primary">{i + 1}. {q?.text}</p>
                </div>
                <div className="space-y-1.5 ml-8">
                  {q?.options.map((opt) => {
                    const isCorrect = opt === r.correctOption;
                    const isPicked = opt === r.selected;
                    return (
                      <div key={opt} className="text-sm px-3 py-1.5 rounded-lg flex items-center gap-2"
                        style={{
                          background: isCorrect ? "rgba(16,185,129,0.10)" : isPicked ? "rgba(239,68,68,0.10)" : "transparent",
                          color: isCorrect ? "var(--state-success)" : isPicked ? "var(--state-error)" : "var(--text-secondary)",
                        }}>
                        {isCorrect && <Check className="h-3 w-3 flex-shrink-0" />}
                        {isPicked && !isCorrect && <X className="h-3 w-3 flex-shrink-0" />}
                        {opt}
                      </div>
                    );
                  })}
                </div>
                {r.explanation && (
                  <p className="text-xs text-muted ml-8 mt-2.5 italic">{r.explanation}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Take quiz ────────────────────────────────────────────
  if (quiz || loadingQuiz) {
    const answeredCount = Object.keys(answers).length;
    const allAnswered = quiz ? answeredCount === quiz.questions.length : false;
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <button type="button" onClick={() => setQuiz(null)}
          className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
          <ArrowLeft className="h-4 w-4" /> Cancel
        </button>

        {loadingQuiz || !quiz ? (
          <div className="h-64 rounded-2xl skeleton" />
        ) : (
          <>
            <div>
              <h1 className="font-display text-xl font-bold text-primary">{quiz.title}</h1>
              <p className="text-secondary text-sm">{answeredCount} / {quiz.questions.length} answered</p>
            </div>

            {quiz.questions.map((q, i) => (
              <div key={q.id} className="glass-panel p-5">
                <p className="text-sm font-medium text-primary mb-3">{i + 1}. {q.text}</p>
                <div className="space-y-2">
                  {q.options.map((opt) => {
                    const picked = answers[q.id] === opt;
                    return (
                      <button key={opt} type="button"
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                        className="w-full text-left text-sm px-3.5 py-2.5 rounded-xl transition-all"
                        style={picked
                          ? { background: "var(--teal-dim)", color: "var(--teal)", border: "1px solid var(--teal-glow)" }
                          : { background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <button type="button" onClick={submit} disabled={submitting || !allAnswered}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #0F6B6B, #147878)" }}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {allAnswered ? "Submit quiz" : `Answer all questions (${answeredCount}/${quiz.questions.length})`}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Quiz list ────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-primary mb-1">Quizzes</h1>
        <p className="text-secondary text-sm">Test your knowledge with AI-generated quizzes.</p>
      </div>

      {courses.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {courses.map((c) => (
            <button key={c.id} type="button"
              onClick={() => { if (c.id !== courseId) setLoadingList(true); setCourseId(c.id); }}
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
          <GraduationCap className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--teal)", opacity: 0.4 }} />
          <p className="text-secondary text-sm font-medium">No courses yet</p>
          <p className="text-muted text-xs mt-1">Quizzes appear once your courses have materials.</p>
        </div>
      ) : loadingList ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}</div>
      ) : quizzes.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <GraduationCap className="h-10 w-10 mx-auto mb-4" style={{ color: "var(--teal)", opacity: 0.4 }} />
          <p className="text-secondary text-sm font-medium">No quizzes available yet</p>
          <p className="text-muted text-xs mt-1">
            Quizzes are auto-generated when a teacher uploads a PDF with extractable text.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {quizzes.map((q) => (
            <button key={q.id} type="button" onClick={() => startQuiz(q.id)}
              className="glass-panel glass-panel-hover w-full text-left p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--teal-dim)" }}>
                <GraduationCap className="h-5 w-5" style={{ color: "var(--teal)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{q.title}</p>
                <p className="text-xs text-muted mt-0.5">
                  {q.questionCount} questions
                  {q.lastAttempt && ` · last score ${Math.round((q.lastAttempt.score / q.lastAttempt.totalQ) * 100)}%`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
