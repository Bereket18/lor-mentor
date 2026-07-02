"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import type { User } from "@/types";

export const ME_QUERY_KEY = ["me"] as const;

/**
 * Fetch the current user. Returns null (not throws) when logged out, so React
 * Query caches the "logged out" state instead of sitting in an error loop.
 */
async function fetchMe(): Promise<User | null> {
  try {
    const res = await api.get("/me");
    return res.data.user as User;
  } catch {
    return null;
  }
}

/**
 * Auth hook backed by React Query.
 *
 * Previously every component that called useAuth() ran its own `/me` request
 * and kept its own state — so a single page mount could fire `/me` many times
 * and each route change re-fetched from scratch. Now all callers share one
 * cached ["me"] query: one network call, instant on subsequent mounts, and no
 * loading flash when navigating between pages.
 *
 * The returned shape is unchanged, so existing consumers need no edits.
 */
export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isPending: loading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
  });
  // user: undefined while the first fetch is in flight, then User | null.

  async function login(email: string, password: string) {
    const res = await api.post("/auth/login", { email, password });
    // Seed the cache directly — no extra /me round-trip needed.
    queryClient.setQueryData(ME_QUERY_KEY, res.data.user as User);
    return res.data;
  }

  async function logout(redirectTo: string | null = "/login") {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore errors — still clear state and redirect
    }
    queryClient.setQueryData(ME_QUERY_KEY, null);
    router.push("/login");
  }

  async function register(fullName: string, email: string, password: string) {
    const res = await api.post("/auth/register", { fullName, email, password });
    return res.data;
  }

  // Force a fresh /me (e.g. after editing the profile name).
  async function checkAuth() {
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
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
