"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BookOpen, Users, ArrowRight, Plus, BarChart3, PlayCircle, FileText } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Course {
  id: string;
  title: string;
  description?: string | null;
  isPublished: boolean;
  _count?: { materials: number };
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function TeacherDashboardPage() {
  const { user } = useAuth();
  const [courses, setCourses]   = useState<Course[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    api.get("/courses/mine")
      .then((r) => setCourses(r.data ?? []))
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, []);

  const firstName = user?.fullName?.split(" ")[0] ?? "Teacher";

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <h1 className="font-display text-2xl font-bold text-primary mb-1">
          Welcome, {firstName}
        </h1>
        <p className="text-secondary text-sm">
          Manage your courses and track student progress.
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={fadeUp} initial="hidden" animate="show"
        transition={{ delay: 0.05 }}
        className="grid grid-cols-3 gap-4"
      >
        {[
          { icon: BookOpen,   label: "Courses",   value: courses.length },
          { icon: Users,      label: "Students",  value: "—" },
          { icon: BarChart3,  label: "Materials", value: courses.reduce((s, c) => s + (c._count?.materials ?? 0), 0) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, rgba(20,120,120,0.12) 0%, rgba(45,212,191,0.06) 100%)",
              border: "1px solid rgba(45,212,191,0.12)",
            }}
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
              style={{ background: "rgba(45,212,191,0.12)" }}
            >
              <stat.icon className="h-4 w-4" style={{ color: "#2DD4BF" }} />
            </div>
            <p className="text-2xl font-bold text-primary">{stat.value}</p>
            <p className="text-xs text-secondary">{stat.label}</p>
          </div>
        ))}
      </motion.div>

      {/* My Courses */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.1 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-primary">My Courses</h2>
          <Link
            href="/teacher/courses"
            className="text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-80"
            style={{ color: "#14B8A6" }}
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl skeleton" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ border: "1px dashed rgba(45,212,191,0.2)" }}
          >
            <BookOpen className="h-8 w-8 mx-auto mb-3" style={{ color: "rgba(45,212,191,0.4)" }} />
            <p className="text-secondary text-sm mb-4">No courses assigned yet.</p>
            <p className="text-muted text-xs">Ask an admin to assign a course to you.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {courses.slice(0, 5).map((course) => (
              <Link key={course.id} href={`/teacher/courses`}>
                <div
                  className="flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all cursor-pointer group"
                  style={{ border: "1px solid rgba(45,212,191,0.08)" }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(45,212,191,0.04)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(45,212,191,0.18)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(45,212,191,0.08)";
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(20,120,120,0.2)" }}
                  >
                    <BookOpen className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{course.title}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {course._count?.materials ?? 0} materials
                      </span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={
                          course.isPublished
                            ? { background: "rgba(16,185,129,0.15)", color: "#10B981" }
                            : { background: "rgba(245,158,11,0.15)", color: "#F59E0B" }
                        }
                      >
                        {course.isPublished ? "Published" : "Draft"}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#2DD4BF" }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>

      {/* Quick actions */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.15 }}>
        <h2 className="text-sm font-semibold text-primary mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Plus,       label: "Add Material",  href: "/teacher/courses",    sub: "Upload PDF or video" },
            { icon: PlayCircle, label: "Upload Video",   href: "/teacher/courses",    sub: "Add YouTube link" },
          ].map((action) => (
            <Link key={action.label} href={action.href}>
              <div
                className="rounded-2xl p-4 cursor-pointer transition-all group"
                style={{
                  background: "rgba(20,120,120,0.08)",
                  border: "1px solid rgba(45,212,191,0.1)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(20,120,120,0.15)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(45,212,191,0.25)";
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(20,120,120,0.08)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(45,212,191,0.1)";
                  (e.currentTarget as HTMLElement).style.transform = "";
                }}
              >
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: "rgba(45,212,191,0.12)" }}
                >
                  <action.icon className="h-4 w-4" style={{ color: "#2DD4BF" }} />
                </div>
                <p className="text-sm font-semibold text-primary">{action.label}</p>
                <p className="text-xs text-muted mt-0.5">{action.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
