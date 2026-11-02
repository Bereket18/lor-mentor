export interface AnatomySystemSummary {
  id: string;
  slug: string;
  name: string;
  latinName: string | null;
  description: string;
  modelUrl: string | null;
  isSample: boolean;
  isPublished: boolean;
  sortOrder: number;
  structureCount: number;
}

export interface AnatomyStructureRelated {
  slug: string;
  name: string;
}

export interface AnatomyStructure {
  id: string;
  systemId: string;
  slug: string;
  name: string;
  latinName: string | null;
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
  meshName: string | null;
  layer: string | null;
  relatedSlugs: string[];
  references: string[];
  sortOrder: number;
  isReviewed: boolean;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  lastEditedByName: string | null;
  lastEditedAt: string | null;
  updatedAt: string;
  related: AnatomyStructureRelated[];
}

export interface AnatomySystemDetail extends AnatomySystemSummary {
  structures: AnatomyStructure[];
}

export type AnatomyReviewStatus = "empty" | "draft" | "pending" | "reviewed";

export interface AnatomyReviewCounts {
  empty: number;
  draft: number;
  pending: number;
  reviewed: number;
}

export interface AnatomyReviewSystemSummary extends AnatomySystemSummary {
  counts: AnatomyReviewCounts;
}

export interface AnatomyReviewStructure
  extends Omit<AnatomyStructure, "related"> {
  status: AnatomyReviewStatus;
  related?: AnatomyStructureRelated[];
}

export interface AnatomyReviewSystemDetail
  extends Omit<AnatomySystemSummary, "structureCount"> {
  structureCount: number;
  structures: AnatomyReviewStructure[];
}

export interface AnatomyEditableFields {
  summary: string;
  location: string | null;
  function: string | null;
  bloodSupply: string | null;
  clinicalNotes: string | null;
  references: string[];
  relatedSlugs: string[];
}

export interface AnatomyRevision {
  id: string;
  structureId: string;
  editorId: string;
  editorName: string;
  createdAt: string;
  previous: AnatomyEditableFields;
  new: AnatomyEditableFields;
  note: string | null;
}

export interface AnatomyQuizQuestion {
  text: string;
  options: string[];
  correctOption: string;
  explanation: string;
}

export interface AnatomyQuizResponse {
  system: { slug: string; name: string };
  structure: { slug: string; name: string; latinName: string | null };
  questions: AnatomyQuizQuestion[];
}
