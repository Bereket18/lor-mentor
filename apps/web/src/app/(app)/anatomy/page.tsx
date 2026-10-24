"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  HeartPulse,
  Rotate3d,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import type { AnatomySystemSummary } from "@/types/anatomy";

export default function AnatomyPage() {
  const [systems, setSystems] = useState<AnatomySystemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    api
      .get<AnatomySystemSummary[]>("/anatomy/systems")
      .then((response) => {
        if (active) setSystems(response.data ?? []);
      })
      .catch(() => {
        if (active) {
          setSystems([]);
          setError("The anatomy library could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                Visual learning
              </p>
              <h1 className="font-display text-2xl font-semibold text-primary sm:text-3xl">
                Anatomy Lab
              </h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
            Explore interactive 3D anatomy, select structures, and study
            verified notes with AI explanations and quick quizzes.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <Sparkles className="h-4 w-4 text-ai" />
          AI study tools included with a subscription
        </div>
      </div>

      <div className="glass-panel mt-7 grid gap-4 p-5 sm:grid-cols-3">
        <div className="flex items-start gap-3">
          <Rotate3d className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
          <div>
            <p className="text-xs font-semibold text-primary">Rotate and zoom</p>
            <p className="mt-1 text-xs leading-relaxed text-secondary">
              Inspect each model from any angle on desktop or mobile.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Boxes className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal" />
          <div>
            <p className="text-xs font-semibold text-primary">
              Select a structure
            </p>
            <p className="mt-1 text-xs leading-relaxed text-secondary">
              Click a mesh or use the structure navigator to see its notes.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-ai" />
          <div>
            <p className="text-xs font-semibold text-primary">Study smarter</p>
            <p className="mt-1 text-xs leading-relaxed text-secondary">
              Generate an explanation or a short quiz for the selected part.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-primary">
          Available systems
        </h2>
        {!loading && !error && (
          <span className="text-xs text-muted">
            {systems.length} {systems.length === 1 ? "system" : "systems"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 py-8 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-56 animate-pulse rounded-2xl border border-border bg-surface"
            />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-error/20 bg-error/10 p-6 text-center">
          <p className="text-sm text-error">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setReloadKey((key) => key + 1);
            }}
            className="mt-4 rounded-lg border border-border bg-elevated px-4 py-2 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
          >
            Try again
          </button>
        </div>
      ) : systems.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center">
          <Boxes className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm font-medium text-primary">
            No anatomy systems are published yet
          </p>
          <p className="mt-1 text-xs text-secondary">
            Your faculty will publish systems here when they are ready.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {systems.map((system) => (
            <Link
              key={system.id}
              href={`/anatomy/${system.slug}`}
              className="group flex flex-col rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-accent hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
                  <HeartPulse className="h-5 w-5" />
                </div>
                <span
                  className={
                    system.isSample
                      ? "rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-success"
                      : "rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent"
                  }
                >
                  {system.isSample ? "Free preview" : "Subscriber"}
                </span>
              </div>

              <h3 className="mt-4 font-display text-lg font-semibold text-primary">
                {system.name}
              </h3>
              {system.latinName && (
                <p className="mt-0.5 text-xs italic text-muted">
                  {system.latinName}
                </p>
              )}
              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-secondary">
                {system.description}
              </p>

              <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                  <Boxes className="h-3.5 w-3.5" />
                  {system.structureCount} structures
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors group-hover:text-accent-hover">
                  Open model
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-[11px] text-muted">
        3D anatomy models use BodyParts3D data.{" "}
        <Link
          href="/attribution/anatomy"
          className="font-medium text-accent hover:underline"
        >
          Sources and licence
        </Link>
      </p>
    </div>
  );
}
