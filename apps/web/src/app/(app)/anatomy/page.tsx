"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Droplets,
  ExternalLink,
  HeartPulse,
  Rotate3d,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import api from "@/lib/api";
import type { AnatomySystemSummary } from "@/types/anatomy";

// One icon per system, keyed by slug. New systems get a neutral fallback
// instead of inheriting the heart icon.
const SYSTEM_ICONS: Record<string, LucideIcon> = {
  heart: HeartPulse,
  urinary: Droplets,
};

function systemIcon(slug: string): LucideIcon {
  return SYSTEM_ICONS[slug] ?? Boxes;
}

const labSteps = [
  {
    icon: Rotate3d,
    title: "Rotate and zoom",
    description: "Inspect the model from any angle on desktop or mobile.",
  },
  {
    icon: ScanSearch,
    title: "Select a structure",
    description: "Click a mesh or use the structure navigator.",
  },
  {
    icon: Sparkles,
    title: "Study with AI",
    description: "Generate an explanation or a short quiz for the selected part.",
  },
];

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

  const totalStructures = systems.reduce(
    (total, system) => total + system.structureCount,
    0,
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
            <Boxes className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              Visual learning
            </p>
            <h1 className="font-display text-2xl font-semibold text-primary sm:text-3xl">
              Anatomy Lab
            </h1>
          </div>
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">
          Explore interactive 3D anatomy, select structures, and study the
          accompanying notes with AI explanations and quick quizzes.
        </p>
        {!loading && !error && systems.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {systems.length} {systems.length === 1 ? "system" : "systems"} ·{" "}
            {totalStructures} structures · 3D models from BodyParts3D
          </p>
        )}
        {!loading && !error && systems.some((system) => !system.isPublished) && (
          <p className="mt-2 text-xs text-warning">
            Staff preview: draft systems are visible to teaching and admin staff
            only.
          </p>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <section aria-labelledby="anatomy-systems-heading">
          <div>
            <h2
              id="anatomy-systems-heading"
              className="font-display text-lg font-semibold text-primary"
            >
              Anatomy systems
            </h2>
            <p className="mt-0.5 text-xs text-secondary">
              Choose a system to open its 3D lab.
            </p>
          </div>

          <div className="mt-3" aria-busy={loading}>
            {loading ? (
              <div className="space-y-3" aria-hidden>
                {[0, 1].map((item) => (
                  <div
                    key={item}
                    className="h-40 animate-pulse rounded-2xl border border-border bg-surface"
                  />
                ))}
              </div>
            ) : error ? (
              <div
                role="alert"
                className="rounded-2xl border border-error/20 bg-error/10 p-6"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-error"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-medium text-primary">
                      Could not load the library
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-secondary">
                      {error}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setLoading(true);
                        setError(null);
                        setReloadKey((key) => key + 1);
                      }}
                      className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border bg-elevated px-4 text-sm font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : systems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
                <Boxes
                  className="mx-auto mb-3 h-8 w-8 text-muted"
                  aria-hidden
                />
                <p className="text-sm font-medium text-primary">
                  No anatomy systems are published yet
                </p>
                <p className="mt-1 text-xs leading-relaxed text-secondary">
                  Your faculty will publish systems here when they are ready.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {systems.map((system) => {
                  const SystemIcon = systemIcon(system.slug);
                  return (
                  <li key={system.id}>
                    <Link
                      href={`/anatomy/${system.slug}`}
                      className="group block rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-accent hover:shadow-card-hover sm:p-6"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent transition-colors group-hover:bg-accent/15">
                          <SystemIcon className="h-5 w-5" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h3 className="font-display text-lg font-semibold text-primary">
                              {system.name}
                            </h3>
                            {system.latinName && (
                              <span className="text-xs italic text-muted">
                                {system.latinName}
                              </span>
                            )}
                            <span
                              className={
                                system.isSample
                                  ? "rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success"
                                  : "rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"
                              }
                            >
                              {system.isSample ? "Free preview" : "Subscriber"}
                            </span>
                            {!system.isPublished && (
                              <span className="rounded-full border border-warning/20 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                                Draft
                              </span>
                            )}
                          </div>

                          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-secondary">
                            {system.description}
                          </p>

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                              <Boxes className="h-3.5 w-3.5" aria-hidden />
                              {system.structureCount} structures
                            </span>
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors group-hover:text-accent-hover">
                              Open 3D lab
                              <ArrowRight
                                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                                aria-hidden
                              />
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <aside className="glass-panel p-5" aria-labelledby="lab-guide-heading">
          <h2
            id="lab-guide-heading"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-muted"
          >
            Using the lab
          </h2>
          <ol className="mt-4 space-y-4">
            {labSteps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-elevated text-xs font-semibold text-accent"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-primary">{step.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-secondary">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 border-t border-border pt-4">
            <Link
              href="/attribution/anatomy"
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-accent transition-colors hover:text-accent-hover"
            >
              Model sources and licence
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
