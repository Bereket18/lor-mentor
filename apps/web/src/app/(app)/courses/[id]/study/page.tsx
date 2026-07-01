"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Layers,
  Loader2,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/shared/markdown";
import { SubscriptionGuard } from "@/components/subscription/subscription-guard";

type Tab = "summary" | "flashcards" | "quiz";

interface Material {
  id: string;
  title: string;
  type: "PDF" | "IMAGE" | "YOUTUBE";
}

interface CourseDetail {
  id: string;
  title: string;
  materials: Material[];
}

interface Flashcard {
  id: string;
  front: string;
  back: string;
}

interface Question {
  id: string;
  text: string;
  options: unknown;
  correctOption: string;
  explanation?: string | null;
}

interface AiContent {
  status: "NOT_STARTED" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  summary?: string | null;
  error?: string | null;
  flashcardSet?: { cards: Flashcard[] } | null;
  quizBank?: { questions: Question[] } | null;
}

interface StudyMaterial extends Material {
  ai?: AiContent;
}

function normalizeOptions(options: unknown) {
  if (Array.isArray(options)) return options.map(String);
  if (options && typeof options === "object") {
    return Object.entries(options).map(([key, value]) => `${key}. ${String(value)}`);
  }
  return [];
}

export default function CourseStudyPage() {
  const params = useParams();
  const id = params.id as string;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadStudyContent() {
      setLoading(true);
      try {
        const courseRes = await api.get(`/courses/${id}`);
        const loadedCourse = courseRes.data as CourseDetail;
        const pdfMaterials = loadedCourse.materials.filter((m) => m.type === "PDF");
        const aiResults = await Promise.all(
          pdfMaterials.map(async (material) => {
            try {
              const res = await api.get(`/materials/${material.id}/ai-status`);
              return [material.id, res.data as AiContent] as const;
            } catch {
              return [material.id, { status: "FAILED" } as AiContent] as const;
            }
          }),
        );
        const aiByMaterialId = new Map(aiResults);

        if (!cancelled) {
          setCourse(loadedCourse);
          setMaterials(
            loadedCourse.materials.map((material) => ({
              ...material,
              ai: aiByMaterialId.get(material.id),
            })),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadStudyContent();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const summaries = useMemo(
    () =>
      materials
        .filter((material) => material.ai?.status === "COMPLETED" && material.ai.summary)
        .map((material) => ({ title: material.title, summary: material.ai?.summary ?? "" })),
    [materials],
  );

  const flashcards = useMemo(
    () =>
      materials.flatMap((material) =>
        material.ai?.flashcardSet?.cards?.map((card) => ({
          ...card,
          materialTitle: material.title,
        })) ?? [],
      ),
    [materials],
  );

  const questions = useMemo(
    () =>
      materials.flatMap((material) =>
        material.ai?.quizBank?.questions?.map((question) => ({
          ...question,
          materialTitle: material.title,
        })) ?? [],
      ),
    [materials],
  );

  const pendingMaterials = materials.filter(
    (material) => material.type === "PDF" && material.ai?.status !== "COMPLETED",
  );

  const tabs: { id: Tab; label: string; icon: typeof BookOpen; count: number }[] = [
    { id: "summary", label: "Summary", icon: BookOpen, count: summaries.length },
    { id: "flashcards", label: "Flashcards", icon: Layers, count: flashcards.length },
    { id: "quiz", label: "Quiz", icon: GraduationCap, count: questions.length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <p className="text-secondary">Course not found.</p>
      </div>
    );
  }

  return (
    <SubscriptionGuard>
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href={`/courses/${course.id}`}
          className="inline-flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to materials
        </Link>

        <div>
          <div className="flex items-center gap-2 text-ai mb-2">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">AI Study Tools</span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-primary">
            {course.title}
          </h1>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-subtle pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  activeTab === tab.id
                    ? "bg-ai-dim text-ai"
                    : "text-secondary hover:bg-elevated hover:text-primary",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                <span className="text-xs text-muted">{tab.count}</span>
              </button>
            );
          })}
        </div>

        {activeTab === "summary" && (
          <div className="space-y-6">
            {summaries.length === 0 ? (
              <EmptyStudyState pendingMaterials={pendingMaterials} />
            ) : (
              summaries.map((item) => (
                <section key={item.title} className="space-y-2 border-b border-subtle pb-5 last:border-0">
                  <h2 className="text-sm font-semibold text-primary">{item.title}</h2>
                  <Markdown content={item.summary} />
                </section>
              ))
            )}
          </div>
        )}

        {activeTab === "flashcards" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {flashcards.length === 0 ? (
              <EmptyStudyState pendingMaterials={pendingMaterials} />
            ) : (
              flashcards.map((card) => {
                const isFlipped = flipped[card.id];
                return (
                  <button
                    key={card.id}
                    onClick={() => setFlipped((prev) => ({ ...prev, [card.id]: !prev[card.id] }))}
                    className="min-h-36 rounded-xl border border-default bg-surface p-4 text-left hover:border-ai/40 transition-colors"
                  >
                    <p className="text-[11px] text-muted mb-3 truncate">{card.materialTitle}</p>
                    <p className="text-sm text-primary leading-6">{isFlipped ? card.back : card.front}</p>
                    <p className="text-xs text-ai mt-4">{isFlipped ? "Show prompt" : "Show answer"}</p>
                  </button>
                );
              })
            )}
          </div>
        )}

        {activeTab === "quiz" && (
          <div className="space-y-5">
            {questions.length === 0 ? (
              <EmptyStudyState pendingMaterials={pendingMaterials} />
            ) : (
              questions.map((question, index) => {
                const selected = answers[question.id];
                const options = normalizeOptions(question.options);
                const isCorrect =
                  selected === question.correctOption ||
                  selected?.startsWith(`${question.correctOption}.`);

                return (
                  <section key={question.id} className="border-b border-subtle pb-5 last:border-0">
                    <p className="text-[11px] text-muted mb-2">{question.materialTitle}</p>
                    <h2 className="text-sm font-semibold text-primary leading-6 mb-3">
                      {index + 1}. {question.text}
                    </h2>
                    <div className="space-y-2">
                      {options.map((option) => (
                        <button
                          key={option}
                          onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: option }))}
                          className={cn(
                            "w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors",
                            selected === option
                              ? "border-ai bg-ai-dim text-primary"
                              : "border-default bg-surface text-secondary hover:text-primary",
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    {selected && (
                      <div className="mt-3 flex items-start gap-2 text-sm text-secondary">
                        <CheckCircle2 className={cn("h-4 w-4 mt-0.5", isCorrect ? "text-success" : "text-warning")} />
                        <p>
                          {isCorrect ? "Correct." : `Correct answer: ${question.correctOption}.`} {question.explanation}
                        </p>
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>
        )}
      </div>
    </SubscriptionGuard>
  );
}

function EmptyStudyState({ pendingMaterials }: { pendingMaterials: StudyMaterial[] }) {
  if (pendingMaterials.length === 0) {
    return (
      <p className="text-sm text-secondary py-10">
        No AI study content is available yet. Upload a PDF to generate summaries,
        flashcards, and quiz questions.
      </p>
    );
  }

  return (
    <div className="space-y-3 py-6">
      <p className="text-sm text-secondary">AI content is still being prepared for:</p>
      <div className="space-y-2">
        {pendingMaterials.map((material) => {
          const failed = material.ai?.status === "FAILED";
          return (
            <div key={material.id} className="text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-primary truncate">{material.title}</span>
                <span
                  className={cn(
                    "text-xs",
                    failed ? "text-warning" : "text-muted",
                  )}
                >
                  {material.ai?.status ?? "NOT_STARTED"}
                </span>
              </div>
              {failed && (
                <p className="text-xs text-muted mt-1">
                  {material.ai?.error
                    ? `Reason: ${material.ai.error}`
                    : "Generation failed. Ask your teacher to regenerate it."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
