"use client";

import dynamic from "next/dynamic";
import { Loader2, Rotate3d, ShieldAlert } from "lucide-react";
import { isAllowedAnatomyModelUrl } from "@/lib/anatomy";
import type { AnatomyReviewStructure } from "@/types/anatomy";

const AnatomyScene = dynamic(
  () =>
    import("@/components/anatomy/anatomy-scene").then(
      (module) => module.AnatomyScene,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden />
      </div>
    ),
  },
);

interface AnatomyReviewViewportProps {
  modelUrl: string | null;
  selectedMeshName: string | null;
  structures: AnatomyReviewStructure[];
  onSelectStructure: (structure: AnatomyReviewStructure) => void;
}

/**
 * Thin wrapper around the existing AnatomyScene. The review tool deliberately
 * does not add a second 3D implementation: it reuses the same loader, mesh
 * selection, and theme-aware highlight code as the student viewer.
 */
export function AnatomyReviewViewport({
  modelUrl,
  selectedMeshName,
  structures,
  onSelectStructure,
}: AnatomyReviewViewportProps) {
  if (!modelUrl || !isAllowedAnatomyModelUrl(modelUrl)) {
    return (
      <div className="flex h-[clamp(320px,42vh,480px)] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center">
        <Rotate3d className="h-7 w-7 text-muted" aria-hidden />
        <p className="text-sm font-medium text-primary">
          No 3D model for this system
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-secondary">
          The teaching text can still be edited and reviewed. This system has no
          published GLB yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative h-[clamp(320px,42vh,480px)] overflow-hidden rounded-xl border border-border bg-surface"
      role="img"
      aria-label="Interactive 3D model preview. Select a structure from the list to highlight it."
    >
      <AnatomyScene
        modelUrl={modelUrl}
        selectedMeshName={selectedMeshName}
        selectedIsTextOnly={false}
        hiddenMeshNames={[]}
        onSelectMesh={(meshName) => {
          if (!meshName) return;
          const structure = structures.find(
            (candidate) => candidate.meshName === meshName,
          );
          if (structure) onSelectStructure(structure);
        }}
        onModelError={() => undefined}
        onRendererUnavailable={() => undefined}
      />
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-elevated/90 px-3 py-1.5 text-xs text-secondary shadow-card backdrop-blur">
        <ShieldAlert className="h-3.5 w-3.5 text-accent" aria-hidden />
        Preview only: edits save to the database, not the GLB.
      </div>
    </div>
  );
}
