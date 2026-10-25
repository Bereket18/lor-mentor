"use client";

import { useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";
import {
  Activity,
  ArrowLeft,
  Boxes,
  ChevronRight,
  Droplets,
  ExternalLink,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import Link from "next/link";
import { AnatomyAiPanel } from "@/components/anatomy/anatomy-ai-panel";
import { Badge } from "@/components/ui/badge";
import { layerLabel, matchesStructureQuery } from "@/lib/anatomy";
import type {
  AnatomyStructure,
  AnatomySystemDetail,
} from "@/types/anatomy";

interface AnatomyDetailPanelProps {
  system: AnatomySystemDetail;
  selected: AnatomyStructure | null;
  onSelect: (structure: AnatomyStructure) => void;
  onClear: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  visibleLayers: string[];
  searchInputRef?: RefObject<HTMLInputElement | null>;
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
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </p>
        <p className="mt-0.5 text-sm leading-relaxed text-secondary">
          {value || "Not recorded in the verified notes."}
        </p>
      </div>
    </div>
  );
}

function TextOnlyBadge({ testId }: { testId?: string }) {
  return (
    <Badge
      variant="outline"
      className="border-border bg-elevated text-secondary"
      data-testid={testId}
    >
      <Boxes aria-hidden />
      No 3D model
    </Badge>
  );
}

export function AnatomyDetailPanel({
  system,
  selected,
  onSelect,
  onClear,
  query,
  onQueryChange,
  visibleLayers,
  searchInputRef,
}: AnatomyDetailPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const visible = new Set(visibleLayers);
  const filtered = system.structures.filter(
    (structure) =>
      (!structure.layer || visible.has(structure.layer)) &&
      matchesStructureQuery(structure, query),
  );

  const meshCount = system.structures.filter(
    (structure) => structure.meshName !== null,
  ).length;
  const textOnlyCount = system.structures.length - meshCount;

  const grouped = new Map<string, AnatomyStructure[]>();
  for (const structure of filtered) {
    const key = structure.layer ?? "other";
    const existing = grouped.get(key);
    if (existing) {
      existing.push(structure);
    } else {
      grouped.set(key, [structure]);
    }
  }

  const isFiltering = query.trim().length > 0 || filtered.length !== system.structures.length;

  // Roving arrow-key support inside the grouped list. Native buttons already
  // handle Enter/Space; this makes the long list faster to scan from a keyboard.
  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "[data-anatomy-structure]",
      ) ?? [],
    );
    if (buttons.length === 0) return;

    event.preventDefault();
    const current = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );

    let next = 0;
    if (event.key === "End") next = buttons.length - 1;
    else if (event.key === "ArrowDown") next = Math.min(current + 1, buttons.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(current - 1, 0);

    buttons[next].focus();
  }

  return (
    <aside className="glass-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">
              Structure navigator
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2
                className="font-display text-lg font-semibold text-primary"
                data-testid="anatomy-structure-title"
              >
                {selected ? selected.name : "Explore the model"}
              </h2>
              {selected && selected.meshName === null && (
                <TextOnlyBadge testId="anatomy-title-text-only-badge" />
              )}
            </div>
            <p className="mt-1 text-xs text-muted">
              {meshCount} in 3D <span aria-hidden="true">·</span>{" "}
              {textOnlyCount} text-only
            </p>
          </div>
          {selected && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
            >
              <ArrowLeft className="h-3 w-3" />
              All
            </button>
          )}
        </div>

        <label
          htmlFor="anatomy-structure-search"
          className="mt-4 block text-xs font-medium uppercase tracking-wide text-muted"
        >
          Search structures
        </label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchInputRef}
            id="anatomy-structure-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Name, Latin name, or note…"
            autoComplete="off"
            className="min-h-11 w-full rounded-lg border border-border bg-elevated py-2 pl-9 pr-11 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-accent [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {isFiltering && (
          <p className="mt-2 text-xs text-muted" role="status">
            Showing {filtered.length} of {system.structures.length} structures
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {selected ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                {layerLabel(selected.layer)}
              </span>
              {selected.isReviewed ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  <ShieldCheck className="h-3 w-3" />
                  Faculty reviewed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
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
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
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
                        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
                      >
                        {related.name}
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selected.references.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  References
                </p>
                <ul className="mt-2 space-y-2">
                  {selected.references.map((reference) => (
                    <li
                      key={reference}
                      className="text-xs leading-relaxed text-muted"
                    >
                      {reference}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/attribution/anatomy"
                  className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent hover:underline"
                >
                  Model sources and licence
                  <ExternalLink className="h-3 w-3" />
                </Link>
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

            {filtered.length === 0 ? (
              <div className="mt-6 rounded-xl border border-border bg-elevated p-4 text-center">
                <p className="text-sm font-medium text-primary">
                  No structures match
                </p>
                <p className="mt-1 text-xs leading-relaxed text-secondary">
                  Try a different search term, or turn a layer back on in the
                  filter bar above the model.
                </p>
                {query && (
                  <button
                    type="button"
                    onClick={() => onQueryChange("")}
                    className="mt-3 min-h-11 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary"
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div
                ref={listRef}
                onKeyDown={handleListKeyDown}
                className="mt-5 space-y-5"
              >
                {Array.from(grouped.entries()).map(([layer, structures]) => (
                  <div key={layer}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      {layerLabel(layer === "other" ? null : layer)}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {structures.map((structure) => (
                        <button
                          key={structure.slug}
                          type="button"
                          data-anatomy-structure
                          data-text-only={
                            structure.meshName === null ? "true" : undefined
                          }
                          onClick={() => onSelect(structure)}
                          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5 text-left text-sm text-secondary transition-colors hover:border-border-accent hover:text-primary focus:outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate">
                              {structure.name}
                            </span>
                            {structure.meshName === null && <TextOnlyBadge />}
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
