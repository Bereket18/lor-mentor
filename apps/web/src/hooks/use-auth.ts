"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import type { User } from "@/types";

export function useAuth() {
  const router = useRouter();

  // The currently logged-in user
  // null means not logged in
  // undefined means we are still checking
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in when the hook first runs
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      // Try to get the current user from the backend
      // If the cookie is valid this succeeds
      // If not it throws a 401 error
      const res = await api.get("/me");
      setUser(res.data.user);
    } catch {
      // Not logged in
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
    await api.post("/auth/logout");
    setUser(null);
    router.push("/login");
  }

  async function register(fullName: string, email: string, password: string) {
    const res = await api.post("/auth/register", {
      fullName,
      email,
      password,
    });
    return res.data;
  }

  // Helper properties
  const isLoggedIn = !!user;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isTeacher = user?.role === "TEACHER";
  const isStudent = user?.role === "STUDENT";

  return {
    user,
    loading,
    isLoggedIn,
    isAdmin,
    isTeacher,
    isStudent,
    login,
    logout,
    register,
    checkAuth,
  };
}
