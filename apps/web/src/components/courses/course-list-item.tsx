"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, ArrowRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface CourseListItemProps {
  id: string;
  title: string;
  description?: string | null;
  teacherName?: string;
  materialsCount?: number;
  progress?: number; // 0-100, undefined means "not enrolled yet"
  index: number;
}

export function CourseListItem({
  id,
  title,
  description,
  teacherName,
  materialsCount = 0,
  progress,
  index,
}: CourseListItemProps) {
  const isEnrolled = typeof progress === "number";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <Link href={`/courses/${id}`}>
        <div
          className={cn(
            "group flex items-center gap-4 py-4 px-3 -mx-3 rounded-xl",
            "hover:bg-elevated transition-colors duration-150",
            "border-b border-subtle last:border-0",
          )}
        >
          {/* Icon block — subtle, not a big colorful card */}
          <div
            className="w-10 h-10 rounded-xl bg-accent-dim
            flex items-center justify-center flex-shrink-0"
          >
            <BookOpen className="h-4 w-4 text-accent" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary truncate">{title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {teacherName && (
                <p className="text-xs text-muted truncate">{teacherName}</p>
              )}
              {materialsCount > 0 && (
                <>
                  <span className="text-muted text-xs">·</span>
                  <span className="text-xs text-muted flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {materialsCount}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Progress or Enroll state */}
          {isEnrolled ? (
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-20 progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-secondary w-8 text-right">
                {progress}%
              </span>
            </div>
          ) : (
            <span
              className="text-xs font-medium text-accent flex items-center gap-1
              flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              View
              <ArrowRight className="h-3 w-3" />
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
