import Link from "next/link";
import { Check, ArrowRight, ArrowLeft } from "lucide-react";
import { PLAN_FEATURES } from "@/lib/plan-features";
import { BrandLogo } from "@/components/shared/brand-logo";
import { resolveApiOrigin } from "@/lib/api-base";

interface Plan {
  id: string;
  name: string;
  description?: string | null;
  priceETB: string | number;
  durationMonths: number;
}

// Server-side fetch of the public plan list. Cached + revalidated every 5 min
// (the API also sends Cache-Control), so the pricing page renders instantly
// from the server with no client-side fetch waterfall or loading spinner.
async function getPlans(): Promise<Plan[]> {
  try {
    // Throws on an empty/malformed/loopback-in-production value; the catch
    // below keeps the marketing page rendering (with no plans) rather than
    // 500-ing. The build-time gate in next.config.ts is what fails a bad
    // deployment. See src/lib/api-base.ts.
    const apiOrigin = resolveApiOrigin();
    const res = await fetch(`${apiOrigin}/api/v1/plans`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    return (await res.json()) as Plan[];
  } catch {
    return [];
  }
}

export default async function PricingPage() {
  const plans = await getPlans();

  return (
    <div className="min-h-screen bg-base">
      <div className="max-w-4xl mx-auto px-6 py-10 sm:py-16">
        <div className="flex items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-3">
            <BrandLogo
              variant="mark"
              size={40}
              priority
              alt=""
              className="ring-1 ring-white/10"
            />
            <div>
              <p className="font-bold text-sm tracking-[0.18em] uppercase leading-none text-primary">
                LOR MENTOR
              </p>
              <p className="text-[11px] font-medium mt-1 text-secondary">
                Lorcan Medical College
              </p>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-secondary
              hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>

        <div className="text-center mb-12">
          <h1 className="font-display text-3xl font-semibold text-primary mb-3">
            Choose your plan
          </h1>
          <p className="text-secondary text-sm max-w-md mx-auto">
            Pay online with Chapa for instant access or upload a bank transfer
            receipt and get approved by admin, usually within 24 hours.
          </p>
        </div>

        {plans.length === 0 ? (
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
                  <span className="text-base font-normal text-secondary">
                    ETB
                  </span>
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

                <Link
                  href={`/pricing/subscribe?planId=${plan.id}`}
                  className="group w-full bg-accent hover:bg-accent-hover text-white
                    font-medium rounded-xl py-3 flex items-center justify-center gap-2
                    transition-all"
                >
                  Get started
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
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
