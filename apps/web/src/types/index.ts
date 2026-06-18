// ── User ──────────────────────────────────────────────────
export type Role = "GUEST" | "STUDENT" | "TEACHER" | "ADMIN" | "SUPER_ADMIN";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  avatarPath: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
}

// ── Auth ──────────────────────────────────────────────────
export interface LoginResponse {
  message: string;
  user: User;
}

export interface RegisterResponse {
  message: string;
  verifyToken: string; // Remove in production
}

// ── API ───────────────────────────────────────────────────
export interface ApiError {
  message: string;
  statusCode: number;
}
// ── Academic structure ───────────────────────────────────────
export interface Department {
  id:          string
  name:        string
  description?: string | null
  isArchived?: boolean
  _count?: {
    academicYears: number
    students?:     number
  }
}

export interface AcademicYear {
  id:    string
  label: string
  _count?: { semesters: number }
}

export interface Semester {
  id:   string
  name: string
  _count?: { courses: number }
}

export interface Course {
  id:          string
  title:       string
  description?: string | null
  isPublished: boolean
  teacher?:    { fullName: string } | null
}