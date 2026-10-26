"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { isAxiosError } from "axios";
import {
  ArrowLeft,
  Boxes,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Scan,
  SearchX,
  ShieldAlert,
} from "lucide-react";
import api from "@/lib/api";
import { AnatomyDetailPanel } from "@/components/anatomy/anatomy-detail-panel";
import { ANATOMY_FOCUS_RING } from "@/components/anatomy/anatomy-focus";
import {
  isAllowedAnatomyModelUrl,
  layerLabel,
  orderedLayers,
} from "@/lib/anatomy";
import type { AnatomySystemDetail } from "@/types/anatomy";

const AnatomyScene = dynamic(
  () =>
    import("@/components/anatomy/anatomy-scene").then(
      (module) => module.AnatomyScene,
    ),
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
              className={`min-h-11 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover ${ANATOMY_FOCUS_RING}`}
            >
              View plans
            </Link>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`min-h-11 rounded-lg border border-border bg-elevated px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
            >
              Try again
            </button>
          )}
          <Link
            href="/anatomy"
            className={`min-h-11 rounded-lg border border-border bg-elevated px-4 py-2.5 text-sm font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
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
  const [query, setQuery] = useState("");
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ViewerError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [resetKey, setResetKey] = useState(0);
  const [modelAttempt, setModelAttempt] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelMeshNames, setModelMeshNames] = useState<string[] | null>(null);
  const [rendererUnavailable, setRendererUnavailable] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleModelReady = useCallback(() => {
    setModelError(null);
    setModelReady(true);
  }, []);
  const handleModelMeshesLoaded = useCallback((meshNames: string[]) => {
    setModelMeshNames(meshNames);
  }, []);
  const handleModelError = useCallback((message: string) => {
    setModelReady(false);
    setModelMeshNames(null);
    setModelError(message);
  }, []);
  const handleRendererUnavailable = useCallback(() => {
    setModelError(null);
    setRendererUnavailable(true);
  }, []);
  const handleRendererRestored = useCallback(() => {
    setRendererUnavailable(false);
  }, []);

  useEffect(() => {
    let active = true;

    api
      .get<AnatomySystemDetail>(`/anatomy/systems/${encodeURIComponent(slug)}`)
      .then((response) => {
        if (!active) return;
        setSystem(response.data);
        setSelectedSlug(null);
        setQuery("");
        setHiddenLayers([]);
        setModelReady(false);
        setModelError(null);
        setModelMeshNames(null);
        setRendererUnavailable(false);
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

  const layers = useMemo(
    () => (system ? orderedLayers(system.structures) : []),
    [system],
  );

  const structures = useMemo(
    () => system?.structures ?? [],
    [system],
  );

  const hiddenMeshNames = useMemo(
    () =>
      structures
        .filter(
          (structure) =>
            structure.layer !== null && hiddenLayers.includes(structure.layer),
        )
        .map((structure) => structure.meshName)
        .filter((meshName): meshName is string => meshName !== null),
    [structures, hiddenLayers],
  );

  const selected = useMemo(
    () =>
      structures.find((structure) => structure.slug === selectedSlug) ?? null,
    [structures, selectedSlug],
  );

  const selectedIsTextOnly = selected !== null && selected.meshName === null;
  const selectedMeshMissing =
    selected?.meshName != null &&
    modelMeshNames !== null &&
    !modelMeshNames.includes(selected.meshName);
  const modelUrlBlocked =
    system?.modelUrl != null && !isAllowedAnatomyModelUrl(system.modelUrl);
  const sceneUnavailable = rendererUnavailable || modelUrlBlocked;
  const sceneAriaLabel = sceneUnavailable
    ? undefined
    : selected
      ? `Interactive 3D model of ${system?.name ?? "this system"}. Selected structure: ${selected.name}. Use the structure navigator for a keyboard-accessible tree of structures.`
      : `Interactive 3D model of ${system?.name ?? "this system"}. Use the structure navigator for a keyboard-accessible tree of structures.`;

  // A database mesh that is absent from the loaded GLB is a content bug. Keep
  // it out of production consoles, but make it visible while developing.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!selectedMeshMissing || !selected || !system) return;

    console.warn(
      `[anatomy] Selected structure "${selected.name}" references mesh "${selected.meshName}", which is not present in ${system.modelUrl}.`,
    );
  }, [selectedMeshMissing, selected, system]);

  // Keyboard shortcuts: Escape clears the selection and "/" focuses search.
  // Ignore both while the user is typing in another field so normal form use
  // never breaks.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (event.key === "Escape" && !typing) {
        setSelectedSlug(null);
        return;
      }

      if (
        (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key === "k")) &&
        !typing
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  function selectMesh(meshName: string | null) {
    if (!meshName) {
      setSelectedSlug(null);
      return;
    }
    const structure = structures.find((item) => item.meshName === meshName);
    if (structure) setSelectedSlug(structure.slug);
  }

  function toggleLayer(layer: string) {
    const hiding = !hiddenLayers.includes(layer);
    if (hiding && selected?.layer === layer) {
      setSelectedSlug(null);
    }
    setHiddenLayers(
      hiding
        ? [...hiddenLayers, layer]
        : hiddenLayers.filter((item) => item !== layer),
    );
  }

  const allLayersVisible = hiddenLayers.length === 0;

  return (
    <div className="-m-6 flex min-h-[calc(100vh-3.5rem)] flex-col bg-base pb-20 lg:h-[calc(100vh-3.5rem)] lg:pb-0">
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-testid="anatomy-live-region"
      >
        {selected
          ? `${selected.name} selected. ${
              selectedIsTextOnly || selectedMeshMissing
                ? "No 3D model; notes only."
                : "Shown in the 3D model."
            }`
          : ""}
      </div>

      <header className="flex flex-shrink-0 flex-col gap-3 border-b border-border bg-surface/70 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            href="/anatomy"
            aria-label="Back to Anatomy Lab"
            className={`mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-elevated text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-display text-lg font-semibold text-primary sm:text-xl">
                {system.name}
              </h1>
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
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

        <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
          <p className="hidden text-xs text-muted sm:block">
            Drag to rotate · Scroll to zoom · Click a structure
          </p>
          <Link
            href="/attribution/anatomy"
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Sources
          </Link>
          <button
            type="button"
            onClick={() => {
              setModelReady(false);
              setModelError(null);
              setModelMeshNames(null);
              setRendererUnavailable(false);
              setResetKey((key) => key + 1);
            }}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset view
          </button>
        </div>
      </header>

      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface/40 px-4 py-2.5 sm:px-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Layers
        </span>
        <div className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5">
          {layers.map((layer) => {
            const visible = !hiddenLayers.includes(layer);
            const count = structures.filter(
              (structure) => structure.layer === layer,
            ).length;
            return (
              <button
                key={layer}
                type="button"
                aria-pressed={visible}
                onClick={() => toggleLayer(layer)}
                className={`inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  visible
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-border bg-elevated text-muted hover:border-border-accent hover:text-secondary"
                } ${ANATOMY_FOCUS_RING}`}
              >
                {visible ? (
                  <Eye className="h-3 w-3" aria-hidden />
                ) : (
                  <EyeOff className="h-3 w-3" aria-hidden />
                )}
                {layerLabel(layer)}
                <span className="text-xs opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
        {!allLayersVisible && (
          <button
            type="button"
            onClick={() => setHiddenLayers([])}
            className={`min-h-11 flex-shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
          >
            Show all
          </button>
        )}
      </div>

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
            <div
              className="absolute inset-0"
              role={sceneUnavailable ? undefined : "img"}
              aria-label={sceneAriaLabel}
            >
              {!modelUrlBlocked && (
                <AnatomyScene
                  key={`${resetKey}-${modelAttempt}`}
                  modelUrl={
                    modelAttempt === 0
                      ? system.modelUrl
                      : `${system.modelUrl}?retry=${modelAttempt}`
                  }
                  selectedMeshName={selected?.meshName ?? null}
                  selectedIsTextOnly={selectedIsTextOnly}
                  hiddenMeshNames={hiddenMeshNames}
                  onSelectMesh={selectMesh}
                  onModelReady={handleModelReady}
                  onModelMeshesLoaded={handleModelMeshesLoaded}
                  onModelError={handleModelError}
                  onRendererUnavailable={handleRendererUnavailable}
                  onRendererRestored={handleRendererRestored}
                />
              )}
              {!modelUrlBlocked && !rendererUnavailable && !modelReady && !modelError && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <div className="flex items-center gap-2 rounded-full border border-border bg-elevated/90 px-4 py-2 text-xs text-secondary shadow-card backdrop-blur">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
                    Loading 3D model…
                  </div>
                </div>
              )}
              {!modelUrlBlocked && !rendererUnavailable && modelError && (
                <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
                  <div className="max-w-sm rounded-xl border border-warning/30 bg-elevated/95 p-5 text-center backdrop-blur">
                    <SearchX className="mx-auto mb-2 h-7 w-7 text-warning" />
                    <p className="text-sm font-medium text-primary">
                      3D model could not load
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-secondary">
                      The written structure notes are still available in the
                      navigator. Check your connection and try again.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setModelError(null);
                        setModelReady(false);
                        setModelMeshNames(null);
                        setModelAttempt((attempt) => attempt + 1);
                      }}
                      className={`mt-3 min-h-11 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                    >
                      Retry model
                    </button>
                  </div>
                </div>
              )}
              {rendererUnavailable && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
                  <div className="max-w-sm rounded-xl border border-border bg-elevated/95 p-5 text-center backdrop-blur">
                    <Scan className="mx-auto mb-2 h-7 w-7 text-warning" />
                    <p className="text-sm font-medium text-primary">
                      3D view unavailable
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-secondary">
                      The 3D renderer was interrupted or could not start. The
                      written structure notes are still available in the
                      navigator. Retry, or enable hardware acceleration and open
                      the lab in another browser.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setRendererUnavailable(false);
                        setModelReady(false);
                        setModelError(null);
                        setModelMeshNames(null);
                        setModelAttempt((attempt) => attempt + 1);
                      }}
                      className={`mt-3 min-h-11 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                    >
                      Retry 3D view
                    </button>
                  </div>
                </div>
              )}
              {modelUrlBlocked && (
                <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
                  <div className="max-w-sm rounded-xl border border-warning/30 bg-elevated/95 p-5 text-center backdrop-blur">
                    <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-warning" />
                    <p className="text-sm font-medium text-primary">
                      3D model blocked
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-secondary">
                      This system points to a model that is not an allowed
                      same-origin anatomy file. The written structure notes are
                      still available in the navigator.
                    </p>
                    <Link
                      href="/anatomy"
                      className={`mt-3 inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                    >
                      Back to Anatomy Lab
                    </Link>
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

          {selected && (selectedIsTextOnly || selectedMeshMissing) && (
            <div
              data-testid="anatomy-viewport-status"
              data-state={selectedIsTextOnly ? "text-only" : "missing-mesh"}
              className="pointer-events-none absolute left-4 top-4 z-20 max-w-[calc(100%-2rem)]"
            >
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border bg-elevated/95 px-3 py-2 text-xs font-medium shadow-card backdrop-blur ${
                  selectedIsTextOnly
                    ? "border-border text-secondary"
                    : "border-warning/30 text-warning"
                }`}
              >
                {selectedIsTextOnly ? (
                  <Boxes className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                ) : (
                  <SearchX className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                )}
                <span>
                  {selectedIsTextOnly
                    ? "No 3D model for this structure"
                    : "This structure is not in the loaded 3D model"}
                </span>
              </div>
            </div>
          )}

          {selected && (
            <div className="pointer-events-none absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-xl border border-white/15 bg-slate-950/70 px-4 py-3 text-white shadow-lg backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
                Selected structure
              </p>
              <p className="mt-0.5 text-sm font-semibold">{selected.name}</p>
              {selected.latinName && (
                <p className="text-xs italic text-white/60">
                  {selected.latinName}
                </p>
              )}
            </div>
          )}

          <p className="pointer-events-none absolute bottom-4 right-4 hidden rounded-lg border border-border bg-elevated/80 px-2.5 py-1.5 text-xs text-muted backdrop-blur sm:block">
            Press <kbd className="font-sans font-semibold">/</kbd> to search ·{" "}
            <kbd className="font-sans font-semibold">Esc</kbd> to clear
          </p>
        </div>

        <div className="min-h-[460px] p-3 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden lg:p-4">
          <AnatomyDetailPanel
            system={system}
            selected={selected}
            onSelect={(structure) => setSelectedSlug(structure.slug)}
            onClear={() => setSelectedSlug(null)}
            query={query}
            onQueryChange={setQuery}
            visibleLayers={layers.filter(
              (layer) => !hiddenLayers.includes(layer),
            )}
            searchInputRef={searchInputRef}
          />
        </div>
      </div>
    </div>
  );
}
