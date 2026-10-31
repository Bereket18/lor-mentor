"use client";

import Link from "next/link";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { AnatomyReviewWorkspace } from "@/components/anatomy/anatomy-review-workspace";
import { ANATOMY_FOCUS_RING } from "@/components/anatomy/anatomy-focus";
import { useAuth } from "@/hooks/use-auth";

export default function AnatomyReviewPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
          <p className="text-sm text-secondary">Checking reviewer access…</p>
        </div>
      </div>
    );
  }

  if (user?.role !== "TEACHER" || !user.isAnatomyReviewer) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center">
        <div
          role="alert"
          className="w-full rounded-2xl border border-border bg-surface p-6 text-center"
        >
          <ShieldAlert
            className="mx-auto mb-3 h-8 w-8 text-warning"
            aria-hidden
          />
          <h1 className="font-display text-lg font-semibold text-primary">
            Faculty review is restricted
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            This workspace is limited to TEACHER accounts explicitly approved as
            anatomy reviewers. Ask an administrator to grant access with the
            `anatomy:reviewer` script.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/anatomy"
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-elevated px-4 text-sm font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Anatomy Lab
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <AnatomyReviewWorkspace reviewerName={user.fullName} />;
}
