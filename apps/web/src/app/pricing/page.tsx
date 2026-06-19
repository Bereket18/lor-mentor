"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { PLAN_FEATURES } from "@/lib/plan-features";

interface Plan {
  id: string;
  name: string;
  description?: string | null;
  priceETB: string | number;
  durationMonths: number;
}

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/plans")
      .then((res) => setPlans(res.data))
      .finally(() => setLoading(false));
  }, []);

  function handleGetStarted(planId: string) {
    router.push(`/pricing/subscribe?planId=${planId}`);
  }

  return (
    <div className="min-h-screen bg-base">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <p className="text-xs font-medium text-accent tracking-wide uppercase mb-3">
            Lor Mentor · Lorcan Medical College
          </p>
          <h1 className="font-display text-3xl font-semibold text-primary mb-3">
            Choose your plan
          </h1>
          <p className="text-secondary text-sm max-w-md mx-auto">
            Upload your bank transfer receipt and get full access once approved
            by admin — usually within 24 hours.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : plans.length === 0 ? (
          <p className="text-center text-secondary text-sm">
            No plans available yet. Please check back soon.
          </p>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-surface border border-default rounded-2xl p-6 flex flex-col"
              >
                <h2 className="font-display text-xl font-semibold text-primary mb-1">
                  {plan.name}
                </h2>
                <p className="text-3xl font-bold text-accent mb-1">
                  {Number(plan.priceETB).toLocaleString()}{" "}
                  <span className="text-base font-normal text-secondary">ETB</span>
                </p>
                <p className="text-xs text-muted mb-6">
                  {plan.durationMonths} month
                  {plan.durationMonths !== 1 ? "s" : ""} access
                </p>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {PLAN_FEATURES.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-secondary"
                    >
                      <Check className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleGetStarted(plan.id)}
                  className="group w-full bg-accent hover:bg-accent-hover text-white
                    font-medium rounded-xl py-3 flex items-center justify-center gap-2
                    transition-all"
                >
                  Get started
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted mt-10">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
