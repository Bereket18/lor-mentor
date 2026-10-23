"use client";

import { useParams } from "next/navigation";
import { AnatomyViewer } from "@/components/anatomy/anatomy-viewer";

export default function AnatomySystemPage() {
  const params = useParams<{ slug: string }>();

  return <AnatomyViewer key={params.slug} slug={params.slug} />;
}
