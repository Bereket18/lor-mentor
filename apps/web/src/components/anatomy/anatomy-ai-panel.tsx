"use client";

import { useState } from "react";
import Link from "next/link";
import { isAxiosError } from "axios";
import {
  CheckCircle2,
  GraduationCap,
  Loader2,
  LockKeyhole,
  Sparkles,
  XCircle,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ANATOMY_FOCUS_RING } from "@/components/anatomy/anatomy-focus";
import { Markdown } from "@/components/shared/markdown";
import type {
  AnatomyQuizQuestion,
  AnatomyQuizResponse,
  AnatomyStructure,
} from "@/types/anatomy";

interface AnatomyAiPanelProps {
  systemSlug: string;
  structure: AnatomyStructure;
}

type AiError = {
  locked: boolean;
  message: string;
};

function readAiError(error: unknown): AiError {
  if (isAxiosError(error)) {
    const status = error.response?.status;
    const responseMessage = error.response?.data?.message;
    const message =
      typeof responseMessage === "string"
        ? responseMessage
        : "The AI service is unavailable right now. Please try again.";

    if (status === 403) {
      return {
        locked: true,
        message:
          "AI study tools are included with an active subscription. Upgrade to continue.",
      };
    }

    return { locked: false, message };
  }

  return {
    locked: false,
    message: "The AI service is unavailable right now. Please try again.",
  };
}

export function AnatomyAiPanel({
  systemSlug,
  structure,
}: AnatomyAiPanelProps) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<AnatomyQuizQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState<"explain" | "quiz" | null>(null);
  const [error, setError] = useState<AiError | null>(null);

  const basePath = `/anatomy/systems/${systemSlug}/structures/${structure.slug}`;

  async function explain() {
    setLoading("explain");
    setError(null);
    setQuiz(null);
    setSubmitted(false);

    try {
      const response = await api.post<{ explanation: string }>(
        `${basePath}/explain`,
      );
      setExplanation(response.data.explanation);
    } catch (requestError) {
      setError(readAiError(requestError));
    } finally {
      setLoading(null);
    }
  }

  async function startQuiz() {
    setLoading("quiz");
    setError(null);
    setExplanation(null);
    setAnswers({});
    setSubmitted(false);

    try {
      const response = await api.post<AnatomyQuizResponse>(`${basePath}/quiz`);
      if (!response.data.questions?.length) {
        throw new Error("No quiz questions were returned.");
      }
      setQuiz(response.data.questions);
    } catch (requestError) {
      setError(readAiError(requestError));
    } finally {
      setLoading(null);
    }
  }

  const score = quiz
    ? quiz.filter((question, index) => answers[index] === question.correctOption)
        .length
    : 0;

  return (
    <section className="mt-6 border-t border-border pt-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ai" />
        <h3 className="font-display text-sm font-semibold text-primary">
          AI study tools
        </h3>
        <span className="badge-ai text-xs">Gemini</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-secondary">
        Generate an exam-focused explanation or a short quiz from this
        structure&apos;s reviewed notes.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void explain()}
          disabled={loading !== null}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
        >
          {loading === "explain" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-ai" />
          )}
          Explain this structure
        </button>
        <button
          type="button"
          onClick={() => void startQuiz()}
          disabled={loading !== null}
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
        >
          {loading === "quiz" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <GraduationCap className="h-3.5 w-3.5 text-accent" />
          )}
          Quiz me
        </button>
      </div>

      {error && (
        <div
          className={cn(
            "mt-4 rounded-lg border px-3 py-3 text-xs leading-relaxed",
            error.locked
              ? "border-ai/30 bg-ai/10 text-secondary"
              : "border-error/30 bg-error/10 text-error",
          )}
        >
          <div className="flex items-start gap-2">
            {error.locked ? (
              <LockKeyhole className="mt-0.5 h-4 w-4 flex-shrink-0 text-ai" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
            <div>
              <p>{error.message}</p>
              {error.locked && (
                <Link
                  href="/pricing"
                  className={`mt-2 inline-flex min-h-11 items-center font-medium text-accent underline decoration-accent/40 underline-offset-2 ${ANATOMY_FOCUS_RING}`}
                >
                  View subscription plans
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {explanation && (
        <div className="mt-4 rounded-xl border border-ai/20 bg-ai/5 p-4">
          <Markdown content={explanation} />
        </div>
      )}

      {quiz && (
        <div className="mt-4 space-y-4">
          {quiz.map((question, questionIndex) => {
            const selected = answers[questionIndex];
            const isCorrect = selected === question.correctOption;

            return (
              <div
                key={`${questionIndex}-${question.text}`}
                className="rounded-xl border border-border bg-base/40 p-4"
              >
                <p className="text-sm font-medium leading-relaxed text-primary">
                  {questionIndex + 1}. {question.text}
                </p>
                <div className="mt-3 space-y-2">
                  {question.options.map((option) => {
                    const isSelected = selected === option;
                    const showCorrect =
                      submitted && option === question.correctOption;
                    const showWrong =
                      submitted && isSelected && !isCorrect;

                    return (
                      <button
                        key={option}
                        type="button"
                        disabled={submitted}
                        onClick={() =>
                          setAnswers((current) => ({
                            ...current,
                            [questionIndex]: option,
                          }))
                        }
                        className={cn(
                          "flex min-h-11 w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs leading-relaxed transition-colors",
                          "border-border bg-elevated text-secondary",
                          !submitted &&
                            "hover:border-border-accent hover:text-primary",
                          isSelected &&
                            !submitted &&
                            "border-accent bg-accent-dim text-primary",
                          showCorrect &&
                            "border-success/50 bg-success/10 text-success",
                          showWrong &&
                            "border-error/50 bg-error/10 text-error",
                          submitted && "cursor-default",
                          ANATOMY_FOCUS_RING,
                        )}
                      >
                        <span className="mt-0.5 flex-shrink-0">
                          {showCorrect ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : showWrong ? (
                            <XCircle className="h-3.5 w-3.5" />
                          ) : (
                            <span className="block h-3.5 w-3.5 rounded-full border border-current opacity-50" />
                          )}
                        </span>
                        {option}
                      </button>
                    );
                  })}
                </div>

                {submitted && (
                  <p className="mt-3 rounded-lg bg-elevated px-3 py-2 text-xs leading-relaxed text-secondary">
                    <span className="font-medium text-primary">
                      Explanation:{" "}
                    </span>
                    {question.explanation}
                  </p>
                )}
              </div>
            );
          })}

          {!submitted ? (
            <button
              type="button"
              onClick={() => setSubmitted(true)}
              disabled={Object.keys(answers).length !== quiz.length}
              className={`min-h-11 w-full rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
            >
              Check answers
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-elevated px-4 py-3">
              <p className="text-sm font-medium text-primary">
                Score: {score} / {quiz.length}
              </p>
              <button
                type="button"
                onClick={() => void startQuiz()}
                disabled={loading !== null}
                className={`inline-flex min-h-11 items-center px-2 text-xs font-medium text-accent transition-colors hover:text-accent-hover disabled:opacity-50 ${ANATOMY_FOCUS_RING}`}
              >
                Generate another quiz
              </button>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted">
        AI-generated study aids can make mistakes. Always check important
        clinical details against your course material and a clinician.
      </p>
    </section>
  );
}
