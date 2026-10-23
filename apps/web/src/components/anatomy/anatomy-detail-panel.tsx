"use client";

import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Droplets,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { AnatomyAiPanel } from "@/components/anatomy/anatomy-ai-panel";
import type {
  AnatomyStructure,
  AnatomySystemDetail,
} from "@/types/anatomy";

interface AnatomyDetailPanelProps {
  system: AnatomySystemDetail;
  selected: AnatomyStructure | null;
  onSelect: (structure: AnatomyStructure) => void;
  onClear: () => void;
}

const LAYER_LABELS: Record<string, string> = {
  chambers: "Chambers",
  septum: "Septum",
  valves: "Valves",
  "great-vessels": "Great vessels",
  "coronary-circulation": "Coronary circulation",
  "wall-layers": "Wall layers",
  conduction: "Conduction system",
};

function layerLabel(layer: string | null): string {
  if (!layer) return "Other structures";
  return (
    LAYER_LABELS[layer] ??
    layer
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-elevated text-accent">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-secondary">
          {value || "Not recorded in the verified notes."}
        </p>
      </div>
    </div>
  );
}

export function AnatomyDetailPanel({
  system,
  selected,
  onSelect,
  onClear,
}: AnatomyDetailPanelProps) {
  const grouped = new Map<string, AnatomyStructure[]>();
  for (const structure of system.structures) {
    const key = structure.layer ?? "other";
    const existing = grouped.get(key);
    if (existing) {
      existing.push(structure);
    } else {
      grouped.set(key, [structure]);
    }
  }

  return (
    <aside className="glass-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-accent">
              Structure navigator
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-primary">
              {selected ? selected.name : "Explore the model"}
            </h2>
          </div>
          {selected && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
            >
              <ArrowLeft className="h-3 w-3" />
              All
            </button>
          )}
        </div>

        <label
          htmlFor="anatomy-structure"
          className="mt-4 block text-[11px] font-medium uppercase tracking-wide text-muted"
        >
          Jump to a structure
        </label>
        <select
          id="anatomy-structure"
          value={selected?.slug ?? ""}
          onChange={(event) => {
            const next = system.structures.find(
              (structure) => structure.slug === event.target.value,
            );
            if (next) {
              onSelect(next);
            } else {
              onClear();
            }
          }}
          className="mt-1.5 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-primary outline-none transition-colors focus:border-accent"
        >
          <option value="">Choose a structure…</option>
          {system.structures.map((structure) => (
            <option key={structure.slug} value={structure.slug}>
              {structure.name}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {selected ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
                {layerLabel(selected.layer)}
              </span>
              {selected.isReviewed ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success">
                  <ShieldCheck className="h-3 w-3" />
                  Faculty reviewed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning">
                  <ShieldAlert className="h-3 w-3" />
                  Pending review
                </span>
              )}
            </div>

            {selected.latinName && (
              <p className="mt-3 font-display text-sm italic text-muted">
                {selected.latinName}
              </p>
            )}

            <p className="mt-3 text-sm leading-relaxed text-secondary">
              {selected.summary}
            </p>

            <div className="mt-5 space-y-4">
              <InfoRow
                icon={MapPin}
                label="Location"
                value={selected.location}
              />
              <InfoRow
                icon={Activity}
                label="Function"
                value={selected.function}
              />
              <InfoRow
                icon={Droplets}
                label="Blood supply"
                value={selected.bloodSupply}
              />
            </div>

            {selected.clinicalNotes && (
              <div className="mt-5 rounded-xl border border-warning/20 bg-warning/5 p-4">
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-warning" />
                  <p className="text-xs font-semibold text-primary">
                    Clinical note
                  </p>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-secondary">
                  {selected.clinicalNotes}
                </p>
              </div>
            )}

            {selected.related.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Related structures
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.related.map((related) => {
                    const structure = system.structures.find(
                      (item) => item.slug === related.slug,
                    );
                    if (!structure) return null;

                    return (
                      <button
                        key={related.slug}
                        type="button"
                        onClick={() => onSelect(structure)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1.5 text-[11px] font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
                      >
                        {related.name}
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <AnatomyAiPanel systemSlug={system.slug} structure={selected} />
          </div>
        ) : (
          <div>
            <p className="text-sm leading-relaxed text-secondary">
              Select a structure directly on the 3D model, or choose one from a
              group below.
            </p>

            <div className="mt-5 space-y-5">
              {Array.from(grouped.entries()).map(([layer, structures]) => (
                <div key={layer}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    {layerLabel(layer === "other" ? null : layer)}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {structures.map((structure) => (
                      <button
                        key={structure.slug}
                        type="button"
                        onClick={() => onSelect(structure)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5 text-left text-sm text-secondary transition-colors hover:border-border-accent hover:text-primary"
                      >
                        <span className="min-w-0 truncate">
                          {structure.name}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
