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
