"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  FileText,
  Image as ImageIcon,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { MaterialViewer } from "@/components/courses/material-viewer";
import { SubscriptionGuard } from "@/components/subscription/subscription-guard";

interface Material {
  id: string;
  title: string;
  type: "PDF" | "IMAGE" | "YOUTUBE";
  youtubeUrl?: string | null;
  uploader?: { id: string; fullName: string } | null;
}

interface CourseDetail {
  id: string;
  title: string;
  description?: string | null;
  teacher?: { fullName: string; email: string } | null;
  materials: Material[];
}

const typeIcon = {
  PDF: FileText,
  IMAGE: ImageIcon,
  YOUTUBE: PlayCircle,
};

export default function CourseDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get(`/courses/${id}`)
      .then((res) => {
        if (!active) return;
        const data = res.data;
        setCourse({
          ...data,
          materials: data.materials ?? [],
        });
      })
      // Swallow failures (incl. a request aborted by a 401 redirect) so they
      // don't surface as an unhandled rejection / dev error overlay.
      .catch(() => active && setCourse(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  // Open a material and record the view (best-effort — ignore failures)
  function openMaterial(material: Material) {
    setActiveMaterial(material);
    api.post(`/progress/${material.id}`).catch(() => {});
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24">
        <p className="text-secondary">Course not found.</p>
      </div>
    );
  }

  return (
    <SubscriptionGuard>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-primary mb-2">
            {course.title}
          </h1>
          {course.description && (
            <p className="text-sm text-secondary leading-relaxed">
              {course.description}
            </p>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-primary mb-4">Materials</h2>

          {course.materials.length === 0 ? (
            <div
              className="text-center py-12 bg-surface border border-default
              rounded-xl"
            >
              <FileText className="h-6 w-6 text-muted mx-auto mb-2" />
              <p className="text-sm text-secondary">
                No materials uploaded yet. Check back soon.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {course.materials.map((material, index) => {
                const Icon = typeIcon[material.type];
                const uploaderName =
                  material.uploader?.fullName ??
                  course.teacher?.fullName ??
                  "Unknown uploader";

                return (
                  <button
                    key={material.id}
                    onClick={() => openMaterial(material)}
                    className={`w-full flex items-center gap-3 py-3.5 px-2 -mx-2
                      rounded-lg text-left hover:bg-elevated transition-colors
                      ${index < course.materials.length - 1 ? "border-b border-subtle" : ""}`}
                  >
                    <Icon className="h-4 w-4 text-accent flex-shrink-0" />
                    <p className="text-sm text-primary flex-1 min-w-0 truncate">
                      {material.title}
                    </p>
                    <span className="text-xs text-muted flex-shrink-0 truncate max-w-36 sm:max-w-56">
                      {uploaderName}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Link
          href={`/courses/${course.id}/study`}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-ai text-white
            rounded-xl text-sm font-medium hover:bg-ai/90 transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          AI Study Tools
        </Link>

        {activeMaterial && (
          <MaterialViewer
            materialId={activeMaterial.id}
            type={activeMaterial.type}
            youtubeUrl={activeMaterial.youtubeUrl}
            title={activeMaterial.title}
            onClose={() => setActiveMaterial(null)}
          />
        )}
      </div>
    </SubscriptionGuard>
  );
}
