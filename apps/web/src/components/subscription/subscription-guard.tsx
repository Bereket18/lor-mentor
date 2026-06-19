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
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user || isAdmin || isTeacher) {
      setIsActive(true);
      setLoading(false);
      return;
    }

    api
      .get("/subscriptions/me")
      .then((res) => setIsActive(res.data.isActive))
      .catch(() => setIsActive(false))
      .finally(() => setLoading(false));
  }, [user, authLoading, isAdmin, isTeacher]);

  if (authLoading || loading) {
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
