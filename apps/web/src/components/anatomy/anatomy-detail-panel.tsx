"use client";

import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, RefObject } from "react";
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
import { ANATOMY_FOCUS_RING } from "@/components/anatomy/anatomy-focus";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { layerLabel, matchesStructureQuery } from "@/lib/anatomy";
import type { AnatomyStructure, AnatomySystemDetail } from "@/types/anatomy";

function focusTreeItem(tree: HTMLElement | null, key: string) {
  requestAnimationFrame(() => {
    const items = tree?.querySelectorAll<HTMLElement>("[data-tree-key]");
    const target = Array.from(items ?? []).find(
      (item) => item.dataset.treeKey === key,
    );
    target?.focus();
  });
}

function reviewDateLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function reviewBadgeText(selected: AnatomyStructure): string {
  if (!selected.isReviewed) return "Pending faculty review";
  const date = reviewDateLabel(selected.reviewedAt);
  if (selected.reviewedByName && date) {
    return `Faculty reviewed by ${selected.reviewedByName} on ${date}`;
  }
  if (selected.reviewedByName) {
    return `Faculty reviewed by ${selected.reviewedByName}`;
  }
  return date ? `Faculty reviewed on ${date}` : "Faculty reviewed";
}

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

function hasTeachingNotes(structure: AnatomyStructure): boolean {
  return [
    structure.summary,
    structure.location,
    structure.function,
    structure.bloodSupply,
    structure.clinicalNotes,
  ].some((value) => typeof value === "string" && value.trim().length > 0);
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
  const treeRef = useRef<HTMLDivElement>(null);
  const restoreTreeFocus = useRef(false);
  const [collapsedLayers, setCollapsedLayers] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(0);

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
  const selectedHasNotes = selected ? hasTeachingNotes(selected) : false;

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

  const isFiltering =
    query.trim().length > 0 || filtered.length !== system.structures.length;
  const groupEntries = Array.from(grouped.entries());

  function isGroupExpanded(layer: string): boolean {
    // Search results stay visible even if the learner collapsed the group
    // before typing.
    return isFiltering || !collapsedLayers.includes(layer);
  }

  const visibleKeys = groupEntries.flatMap(([layer, structures]) => {
    const groupKey = `group:${layer}`;
    return isGroupExpanded(layer)
      ? [
          groupKey,
          ...structures.map((structure) => `structure:${structure.slug}`),
        ]
      : [groupKey];
  });
  const effectiveActiveKey =
    activeKey && visibleKeys.includes(activeKey)
      ? activeKey
      : (visibleKeys[0] ?? null);

  const suggestions = filtered;
  const showSuggestions = searchOpen && suggestions.length > 0;
  const activeOptionIndex = Math.min(
    activeOption,
    Math.max(suggestions.length - 1, 0),
  );
  const activeSuggestion = showSuggestions
    ? (suggestions[activeOptionIndex] ?? null)
    : null;

  useEffect(() => {
    if (selected || !restoreTreeFocus.current) return;
    restoreTreeFocus.current = false;
    if (effectiveActiveKey) {
      focusTreeItem(treeRef.current, effectiveActiveKey);
    } else {
      searchInputRef?.current?.focus();
    }
  }, [selected, effectiveActiveKey, searchInputRef]);

  function selectStructure(structure: AnatomyStructure) {
    setActiveKey(`structure:${structure.slug}`);
    setSearchOpen(false);
    setActiveOption(0);
    restoreTreeFocus.current = true;
    onSelect(structure);
  }

  function toggleGroup(layer: string) {
    if (isFiltering) return;
    const key = `group:${layer}`;
    const expanded = isGroupExpanded(layer);
    setCollapsedLayers((current) =>
      expanded
        ? current.includes(layer)
          ? current
          : [...current, layer]
        : current.filter((item) => item !== layer),
    );
    setActiveKey(key);
    focusTreeItem(treeRef.current, key);
  }

  function handleTreeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const handledKeys = [
      "ArrowDown",
      "ArrowUp",
      "Home",
      "End",
      "ArrowRight",
      "ArrowLeft",
      "Enter",
      " ",
      "Escape",
    ];
    if (!handledKeys.includes(event.key)) return;

    const items = Array.from(
      treeRef.current?.querySelectorAll<HTMLElement>("[data-tree-key]") ?? [],
    );
    if (items.length === 0) return;

    const focused = document.activeElement as HTMLElement | null;
    const focusedKey = focused?.dataset.treeKey;
    const currentIndex = Math.max(
      0,
      items.findIndex(
        (item) => item.dataset.treeKey === (focusedKey ?? effectiveActiveKey),
      ),
    );
    const currentItem = items[currentIndex];
    const key = currentItem.dataset.treeKey ?? "";
    const isGroup = key.startsWith("group:");
    const layer = isGroup ? key.slice("group:".length) : "";
    const expanded = isGroup && isGroupExpanded(layer);
    let next: HTMLElement | null = null;

    switch (event.key) {
      case "ArrowDown":
        next = items[Math.min(currentIndex + 1, items.length - 1)];
        break;
      case "ArrowUp":
        next = items[Math.max(currentIndex - 1, 0)];
        break;
      case "Home":
        next = items[0];
        break;
      case "End":
        next = items[items.length - 1];
        break;
      case "ArrowRight":
        if (isGroup) {
          if (!expanded) {
            setCollapsedLayers((current) =>
              current.filter((item) => item !== layer),
            );
            next = currentItem;
          } else {
            next = items[currentIndex + 1] ?? currentItem;
          }
        }
        break;
      case "ArrowLeft":
        if (isGroup) {
          if (expanded && !isFiltering) {
            setCollapsedLayers((current) =>
              current.includes(layer) ? current : [...current, layer],
            );
            next = currentItem;
          }
        } else {
          for (let index = currentIndex - 1; index >= 0; index -= 1) {
            if (items[index].dataset.treeKey?.startsWith("group:")) {
              next = items[index];
              break;
            }
          }
        }
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        if (isGroup) {
          toggleGroup(layer);
        } else {
          const structure = filtered.find(
            (item) => `structure:${item.slug}` === key,
          );
          if (structure) selectStructure(structure);
        }
        return;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClear();
        return;
    }

    if (next) {
      event.preventDefault();
      setActiveKey(next.dataset.treeKey ?? null);
      next.focus();
    }
  }

  function handleSearchFocus() {
    setSearchOpen(true);
    setActiveOption(0);
  }

  function handleSearchBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setSearchOpen(false);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const lastOption = Math.max(suggestions.length - 1, 0);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveOption((current) =>
        searchOpen ? Math.min(current + 1, lastOption) : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveOption((current) =>
        searchOpen ? Math.max(current - 1, 0) : lastOption,
      );
      return;
    }

    if (event.key === "Enter" && showSuggestions && activeSuggestion) {
      event.preventDefault();
      selectStructure(activeSuggestion);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (searchOpen) {
        setSearchOpen(false);
        return;
      }
      if (query) {
        onQueryChange("");
        setActiveOption(0);
      }
      return;
    }

    if (event.key === "Tab") {
      setSearchOpen(false);
    }
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
              className={`inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
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
        <div className="relative mt-1.5" onBlur={handleSearchBlur}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchInputRef}
            id="anatomy-structure-search"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={showSuggestions}
            aria-controls={
              showSuggestions ? "anatomy-search-listbox" : undefined
            }
            aria-activedescendant={
              activeSuggestion
                ? `anatomy-search-option-${activeOptionIndex}`
                : undefined
            }
            aria-describedby={isFiltering ? "anatomy-search-status" : undefined}
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              setSearchOpen(true);
              setActiveOption(0);
            }}
            onFocus={handleSearchFocus}
            onKeyDown={handleSearchKeyDown}
            placeholder="Name, Latin name, or note…"
            autoComplete="off"
            spellCheck={false}
            className={`min-h-11 w-full rounded-lg border border-border bg-elevated py-2 pl-9 pr-11 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-accent [&::-webkit-search-cancel-button]:hidden ${ANATOMY_FOCUS_RING}`}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                setActiveOption(0);
                setSearchOpen(false);
              }}
              aria-label="Clear search"
              className={`absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-primary ${ANATOMY_FOCUS_RING}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {showSuggestions && (
            <div
              id="anatomy-search-listbox"
              role="listbox"
              aria-label="Matching structures"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-elevated p-1 shadow-card"
            >
              {suggestions.map((structure, index) => (
                <div
                  key={structure.slug}
                  id={`anatomy-search-option-${index}`}
                  role="option"
                  aria-selected={index === activeOptionIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectStructure(structure)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm",
                    index === activeOptionIndex
                      ? "bg-accent/10 text-accent"
                      : "text-secondary hover:bg-surface hover:text-primary",
                  )}
                >
                  <span className="min-w-0 truncate">{structure.name}</span>
                  {structure.meshName === null && <TextOnlyBadge />}
                </div>
              ))}
            </div>
          )}
        </div>

        {isFiltering && (
          <p
            id="anatomy-search-status"
            className="mt-2 text-xs text-muted"
            role="status"
          >
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
                <span
                  data-testid="anatomy-review-badge"
                  data-state="reviewed"
                  className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-medium text-success"
                >
                  <ShieldCheck className="h-3 w-3 flex-shrink-0" aria-hidden />
                  {reviewBadgeText(selected)}
                </span>
              ) : (
                <span
                  data-testid="anatomy-review-badge"
                  data-state="pending"
                  className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning"
                >
                  <ShieldAlert className="h-3 w-3 flex-shrink-0" aria-hidden />
                  Pending faculty review
                </span>
              )}
            </div>

            {selected.latinName && (
              <p className="mt-3 font-display text-sm italic text-muted">
                {selected.latinName}
              </p>
            )}

            {selectedHasNotes ? (
              <>
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
              </>
            ) : (
              <div className="mt-4 rounded-xl border border-border bg-elevated p-4">
                <p className="text-sm font-medium text-primary">
                  Notes coming soon
                </p>
                <p className="mt-1 text-xs leading-relaxed text-secondary">
                  Teaching notes for this structure are awaiting faculty review.
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
                        className={`inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
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
                  className={`mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-accent hover:underline ${ANATOMY_FOCUS_RING}`}
                >
                  Model sources and licence
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            )}

            {selectedHasNotes && (
              <AnatomyAiPanel systemSlug={system.slug} structure={selected} />
            )}
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
                    className={`mt-3 min-h-11 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                  >
                    Clear search
                  </button>
                )}
              </div>
            ) : (
              <div
                ref={treeRef}
                role="tree"
                aria-label={`Structures in ${system.name}`}
                onKeyDown={handleTreeKeyDown}
                className="mt-5 space-y-3"
              >
                {groupEntries.map(([layer, structures]) => {
                  const groupKey = `group:${layer}`;
                  const expanded = isGroupExpanded(layer);
                  const label = layerLabel(layer === "other" ? null : layer);

                  return (
                    <div key={layer} role="none">
                      <div
                        role="treeitem"
                        aria-level={1}
                        aria-expanded={expanded}
                        aria-selected={false}
                        data-tree-key={groupKey}
                        tabIndex={effectiveActiveKey === groupKey ? 0 : -1}
                        onClick={() => toggleGroup(layer)}
                        onFocus={() => setActiveKey(groupKey)}
                        className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 flex-shrink-0 text-muted transition-transform ${
                            expanded ? "rotate-90" : ""
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        <span className="text-xs font-normal normal-case tracking-normal text-muted">
                          {structures.length}
                        </span>
                      </div>

                      {expanded && (
                        <div
                          role="group"
                          aria-label={`${label} structures`}
                          className="ml-3 mt-1.5 space-y-1.5 border-l border-border pl-2"
                        >
                          {structures.map((structure) => {
                            const structureKey = `structure:${structure.slug}`;
                            return (
                              <div
                                key={structure.slug}
                                role="treeitem"
                                aria-level={2}
                                aria-selected={false}
                                data-tree-key={structureKey}
                                data-anatomy-structure
                                data-text-only={
                                  structure.meshName === null
                                    ? "true"
                                    : undefined
                                }
                                tabIndex={
                                  effectiveActiveKey === structureKey ? 0 : -1
                                }
                                onClick={() => selectStructure(structure)}
                                onFocus={() => setActiveKey(structureKey)}
                                className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-elevated px-3 py-2.5 text-left text-sm text-secondary transition-colors hover:border-border-accent hover:text-primary ${ANATOMY_FOCUS_RING}`}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="min-w-0 truncate">
                                    {structure.name}
                                  </span>
                                  {structure.meshName === null && (
                                    <TextOnlyBadge />
                                  )}
                                </span>
                                <ChevronRight
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5 flex-shrink-0 text-muted"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
