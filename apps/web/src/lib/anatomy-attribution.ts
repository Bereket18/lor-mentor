import heartManifest from "../../public/models/anatomy/manifest.json";
import urinaryManifest from "../../public/models/anatomy/urinary.v1.manifest.json";
import { GENERATED_ANATOMY_ATTRIBUTION } from "./anatomy-attribution.generated";

/**
 * Provenance data for each shipped Anatomy Lab model. Each entry points at that
 * model's own manifest; pages derive counts, archives, changes, and licence
 * text from the manifest rather than duplicating heart-specific values.
 */
export interface AnatomyManifestSource {
  tree: string;
  dataset: string;
  polygonReduction?: string;
  archive: string;
  archiveUrl: string;
  extractedObjFiles: number;
  usedFor: string;
  requiredCredit?: string;
}

export interface AnatomyManifestLicense {
  notice: string;
  licenseUrl: string;
  statements: Array<{ source: string; statement: string }>;
  status: string;
  adaptedModelTerms: string;
}

export interface AnatomyManifestStructure {
  slug: string;
  meshName: string;
  layer: string;
  color: string;
  triangles: number;
  fma: string[];
  laterality?: string;
  files: Array<{
    id: string;
    archive: string;
    concept: string;
    name: string;
    sha256: string;
    triangles: number;
  }>;
}

export interface AnatomyModelManifest {
  schemaVersion: number;
  system: string;
  model: {
    file: string;
    bytes: number;
    sha256: string;
    triangles: number;
    structures: number;
    textOnlyStructures: number;
    totalStructures: number;
  };
  sources: AnatomyManifestSource[];
  transform?: {
    sourceUnits?: string;
    sourceUpAxis?: string;
    targetUnits?: string;
    targetUpAxis?: string;
    mapping?: string;
  };
  changes: string[];
  adaptations?: string[];
  sharedStructures?: Array<{
    slug: string;
    meshName: string;
    sharedWith: string[];
    canonicalOwner: string;
    files: string[];
  }>;
  orientation?: {
    viewer?: string;
    outputFrame?: { patientLeftAxis?: string };
  };
  license: AnatomyManifestLicense;
  structures: AnatomyManifestStructure[];
  textOnly?: Array<{
    slug: string;
    layer: string;
    laterality?: string;
    reason: string;
  }>;
}

export interface AnatomyAttributionEntry {
  slug: string;
  name: string;
  status: "live" | "draft";
  manifest: AnatomyModelManifest;
}

export const ANATOMY_ATTRIBUTION: readonly AnatomyAttributionEntry[] = [
  {
    slug: "heart",
    name: "Heart and circulation",
    status: "live",
    manifest: heartManifest as unknown as AnatomyModelManifest,
  },
  {
    slug: "urinary",
    name: "Urinary system",
    status: "draft",
    manifest: urinaryManifest as unknown as AnatomyModelManifest,
  },
  ...GENERATED_ANATOMY_ATTRIBUTION,
];

export function getAnatomyAttribution(
  slug: string,
): AnatomyAttributionEntry | undefined {
  return ANATOMY_ATTRIBUTION.find((entry) => entry.slug === slug);
}

export function manifestSourceFileCount(
  manifest: AnatomyModelManifest,
): number {
  return manifest.structures.reduce(
    (total, structure) => total + structure.files.length,
    0,
  );
}

export function manifestArchiveList(manifest: AnatomyModelManifest): string {
  return manifest.sources.map((source) => source.archive).join(" and ");
}

export function manifestTreeList(manifest: AnatomyModelManifest): string {
  return manifest.sources.map((source) => source.tree).join(" and ");
}
