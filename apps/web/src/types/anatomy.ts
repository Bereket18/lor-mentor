export interface AnatomySystemSummary {
  id: string;
  slug: string;
  name: string;
  latinName: string | null;
  description: string;
  modelUrl: string | null;
  isSample: boolean;
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
  meshName: string;
  layer: string | null;
  relatedSlugs: string[];
  sortOrder: number;
  isReviewed: boolean;
  related: AnatomyStructureRelated[];
}

export interface AnatomySystemDetail extends AnatomySystemSummary {
  structures: AnatomyStructure[];
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
