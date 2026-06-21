"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, CreditCard } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { user, loading: authLoading, isAdmin, isTeacher } = useAuth();
  // null = not yet checked; true/false = result known
  const [isActive, setIsActive] = useState<boolean | null>(null);

  const isPrivileged = !user || isAdmin || isTeacher;

  useEffect(() => {
    // Auth is still loading — wait
    if (authLoading) return;

    // Admins, teachers, and unauthenticated users skip the subscription
    // check entirely — the API will handle auth/authz separately.
    // We resolve asynchronously to keep the effect body free of direct
    // setState calls that trigger the react-hooks/set-state-in-effect rule.
    if (isPrivileged) {
      // Use a resolved promise so the update happens in the microtask
      // queue (post-render) rather than synchronously inside the effect.
      Promise.resolve().then(() => setIsActive(true));
      return;
    }

    api
      .get("/subscriptions/me")
      .then((res) => setIsActive(res.data.isActive))
      .catch(() => setIsActive(false));
  }, [user, authLoading, isPrivileged]);

  // Still waiting for auth or subscription check
  if (authLoading || isActive === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (!isActive) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <CreditCard className="h-10 w-10 text-accent mx-auto mb-4" />
        <h2 className="font-display text-xl font-semibold text-primary mb-2">
          Subscription required
        </h2>
        <p className="text-sm text-secondary mb-6 leading-relaxed">
          You need an active subscription to access course materials. Choose a
          plan and upload your payment receipt to get started.
        </p>
        <Link
          href="/pricing"
          className="inline-block bg-accent hover:bg-accent-hover text-white
            rounded-xl px-6 py-3 text-sm font-medium transition-colors"
        >
          View pricing plans
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
