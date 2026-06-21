"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, FileText } from "lucide-react";
import api from "@/lib/api";

interface CourseDetail {
  id: string;
  title: string;
  description?: string | null;
  teacher?: { fullName: string; email: string } | null;
  materials: { id: string; title: string; type: string }[];
}

export default function CourseDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/courses/${id}`)
      .then((res) => setCourse(res.data))
      .finally(() => setLoading(false));
  }, [id]);

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
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary mb-2">
          {course.title}
        </h1>
        {course.teacher && (
          <p className="text-sm text-secondary">{course.teacher.fullName}</p>
        )}
        {course.description && (
          <p className="text-sm text-secondary mt-3 leading-relaxed">
            {course.description}
          </p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-primary mb-4">Materials</h2>

        {course.materials.length === 0 ? (
          <div
            className="text-center py-12 bg-surface border border-default
            rounded-2xl"
          >
            <FileText className="h-6 w-6 text-muted mx-auto mb-2" />
            <p className="text-sm text-secondary">
              No materials uploaded yet — check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {course.materials.map((m, i) => (
              <div
                key={m.id}
                className={`flex items-center gap-3 py-3.5
                ${i < course.materials.length - 1 ? "border-b border-subtle" : ""}`}
              >
                <FileText className="h-4 w-4 text-accent flex-shrink-0" />
                <p className="text-sm text-primary">{m.title}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
