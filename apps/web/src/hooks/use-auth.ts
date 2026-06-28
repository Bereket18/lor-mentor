"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import type { User } from "@/types";

export function useAuth() {
  const router = useRouter();

  // The currently logged-in user
  // null  → confirmed not logged in
  // undefined → still checking (loading)
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Check auth status once on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      // Try to fetch the current user using the JWT cookie
      const res = await api.get("/me");
      setUser(res.data.user);
    } catch {
      // 401 or network error — treat as logged out
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    setUser(res.data.user);
    return res.data;
  }

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore errors — still clear state and redirect
    }
    setUser(null);
    router.push("/login");
  }

  async function register(fullName: string, email: string, password: string) {
    const res = await api.post("/auth/register", { fullName, email, password });
    return res.data;
  }

  // Convenience booleans
  const isLoggedIn = !!user;
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isTeacher = user?.role === "TEACHER";
  const isStudent = user?.role === "STUDENT";

  return {
    user,
    loading,
    isLoggedIn,
    isSuperAdmin,
    isAdmin,
    isTeacher,
    isStudent,
    login,
    logout,
    register,
    checkAuth,
  };
}
