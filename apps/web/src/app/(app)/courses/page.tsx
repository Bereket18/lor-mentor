"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { CourseListItem } from "@/components/courses/course-list-item";
import { SubscriptionGuard } from "@/components/subscription/subscription-guard";

interface CourseData {
  id: string;
  title: string;
  description?: string | null;
  teacher?: { fullName: string } | null;
  _count?: { materials: number };
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .get("/courses/my-year")
      .then((res) => setCourses(res.data))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = courses.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <SubscriptionGuard>
      <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <h1 className="font-display text-2xl font-semibold text-primary">
          My Courses
        </h1>
      </motion.div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2
          h-4 w-4 text-muted"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your courses..."
          className="w-full bg-surface border border-default rounded-xl
            pl-10 pr-4 py-2.5 text-sm text-primary placeholder:text-muted
            focus:outline-none focus:border-accent focus:ring-2
            focus:ring-accent/20 transition-all"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-secondary mb-1">
            {courses.length === 0
              ? "No courses available yet for your department and year."
              : "No courses match your search."}
          </p>
          {courses.length === 0 && (
            <p className="text-xs text-muted">
              Check back soon — your school is adding content.
            </p>
          )}
        </div>
      ) : (
        <div>
          {filtered.map((course, i) => (
            <CourseListItem
              key={course.id}
              id={course.id}
              title={course.title}
              description={course.description}
              teacherName={course.teacher?.fullName}
              materialsCount={course._count?.materials ?? 0}
              progress={0}
              index={i}
            />
          ))}
        </div>
      )}
      </div>
    </SubscriptionGuard>
  );
}
