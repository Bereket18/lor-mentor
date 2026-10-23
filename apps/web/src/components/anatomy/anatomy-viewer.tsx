"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  Boxes,
  CreditCard,
  Loader2,
  RotateCcw,
  Scan,
} from "lucide-react";
import api from "@/lib/api";
import { AnatomyDetailPanel } from "@/components/anatomy/anatomy-detail-panel";
import type { AnatomySystemDetail } from "@/types/anatomy";

const AnatomyScene = dynamic(
  () =>
    import("@/components/anatomy/anatomy-scene").then((module) => module.AnatomyScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    ),
  },
);

interface AnatomyViewerProps {
  slug: string;
}

interface ViewerError {
  status?: number;
  title: string;
  message: string;
}

function readViewerError(error: unknown): ViewerError {
  if (!isAxiosError(error)) {
    return {
      title: "Could not load this system",
      message: "Check your connection and try again.",
    };
  }

  const status = error.response?.status;
  const responseMessage = error.response?.data?.message;

  if (status === 403) {
    return {
      status,
      title: "Subscription required",
      message:
        "This anatomy system is part of the subscriber library. Choose a plan to unlock the full 3D content.",
    };
  }

  if (status === 404) {
    return {
      status,
      title: "Anatomy system not found",
      message: "This system may have been unpublished or moved.",
    };
  }

  return {
    status,
    title: "Could not load this system",
    message:
      typeof responseMessage === "string"
        ? responseMessage
        : "The anatomy service is unavailable right now. Please try again.",
  };
}

function ViewerState({
  title,
  message,
  status,
  onRetry,
}: ViewerError & { onRetry?: () => void }) {
  return (
    <div className="-m-6 flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-base p-6 pb-24 lg:pb-6">
      <div className="glass-panel w-full max-w-md p-8 text-center">
        {status === 403 ? (
          <CreditCard className="mx-auto mb-4 h-10 w-10 text-accent" />
        ) : status === 404 ? (
          <Boxes className="mx-auto mb-4 h-10 w-10 text-muted" />
        ) : (
          <Scan className="mx-auto mb-4 h-10 w-10 text-accent" />
        )}
        <h1 className="font-display text-xl font-semibold text-primary">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-secondary">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {status === 403 && (
            <Link
              href="/pricing"
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              View plans
            </Link>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-border bg-elevated px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
            >
              Try again
            </button>
          )}
          <Link
            href="/anatomy"
            className="rounded-lg border border-border bg-elevated px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
          >
            Back to Anatomy Lab
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AnatomyViewer({ slug }: AnatomyViewerProps) {
  const [system, setSystem] = useState<AnatomySystemDetail | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ViewerError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const handleModelReady = useCallback(() => setModelReady(true), []);

  useEffect(() => {
    let active = true;

    api
      .get<AnatomySystemDetail>(`/anatomy/systems/${encodeURIComponent(slug)}`)
      .then((response) => {
        if (!active) return;
        setSystem(response.data);
        setSelectedSlug(null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setSystem(null);
        setError(readViewerError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, reloadKey]);

  if (loading) {
    return (
      <div className="-m-6 flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-base">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          <p className="text-sm text-secondary">Loading anatomy model…</p>
        </div>
      </div>
    );
  }

  if (error || !system) {
    return (
      <ViewerState
        {...(error ?? {
          title: "Could not load this system",
          message: "The anatomy system returned no data.",
        })}
        onRetry={() => {
          setLoading(true);
          setError(null);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  const structures = system.structures;
  const selected =
    structures.find((structure) => structure.slug === selectedSlug) ?? null;

  function selectMesh(meshName: string | null) {
    if (!meshName) {
      setSelectedSlug(null);
      return;
    }
    const structure = structures.find((item) => item.meshName === meshName);
    if (structure) setSelectedSlug(structure.slug);
  }

  return (
    <div className="-m-6 flex min-h-[calc(100vh-3.5rem)] flex-col bg-base pb-20 lg:h-[calc(100vh-3.5rem)] lg:pb-0">
      <header className="flex flex-shrink-0 flex-col gap-3 border-b border-border bg-surface/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/anatomy"
            aria-label="Back to Anatomy Lab"
            className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-secondary transition-colors hover:border-border-accent hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-lg font-semibold text-primary sm:text-xl">
                {system.name}
              </h1>
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                {system.isSample ? "Free preview" : "Subscriber"}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              {system.latinName && <span>{system.latinName}</span>}
              <span className="inline-flex items-center gap-1">
                <Boxes className="h-3 w-3" />
                {system.structureCount} structures
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:flex-shrink-0">
          <p className="hidden text-[11px] text-muted sm:block">
            Drag to rotate · Scroll to zoom · Click a structure
          </p>
          <button
            type="button"
            onClick={() => {
              setModelReady(false);
              setResetKey((key) => key + 1);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset view
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <div className="relative h-[52vh] min-h-[360px] overflow-hidden border-b border-border lg:h-auto lg:min-h-0 lg:border-b-0 lg:border-r">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 45%, rgba(20,184,166,0.12) 0%, transparent 58%), linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-base) 100%)",
            }}
          />

          {system.modelUrl ? (
            <div className="absolute inset-0">
              <AnatomyScene
                key={resetKey}
                modelUrl={system.modelUrl}
                selectedMeshName={selected?.meshName ?? null}
                onSelectMesh={selectMesh}
                onModelReady={handleModelReady}
              />
              {!modelReady && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <div className="flex items-center gap-2 rounded-full border border-border bg-elevated/90 px-4 py-2 text-xs text-secondary shadow-card backdrop-blur">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    Loading 3D model…
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-sm rounded-xl border border-border bg-elevated/80 p-5 text-center backdrop-blur">
                <Boxes className="mx-auto mb-2 h-7 w-7 text-muted" />
                <p className="text-sm font-medium text-primary">
                  3D model not available
                </p>
                <p className="mt-1 text-xs leading-relaxed text-secondary">
                  The written structure notes are still available in the
                  navigator.
                </p>
              </div>
            </div>
          )}

          {selected && (
            <div className="pointer-events-none absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-white shadow-lg backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-300">
                Selected structure
              </p>
              <p className="mt-0.5 text-sm font-semibold">{selected.name}</p>
              {selected.latinName && (
                <p className="text-[11px] italic text-white/60">
                  {selected.latinName}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="min-h-[460px] p-3 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:p-4">
          <AnatomyDetailPanel
            system={system}
            selected={selected}
            onSelect={(structure) => setSelectedSlug(structure.slug)}
            onClear={() => setSelectedSlug(null)}
          />
        </div>
      </div>
    </div>
  );
}
