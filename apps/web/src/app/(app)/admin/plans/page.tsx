"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Loader2, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";

interface Plan {
  id: string;
  name: string;
  description?: string | null;
  priceETB: string | number;
  durationMonths: number;
  isActive: boolean;
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    priceETB: "",
    durationMonths: "",
    description: "",
  });

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    setLoading(true);
    try {
      const res = await api.get("/plans/admin");
      setPlans(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.name || !form.priceETB || !form.durationMonths) return;
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      await api.post("/plans", {
        name: form.name,
        priceETB: parseFloat(form.priceETB),
        durationMonths: parseInt(form.durationMonths, 10),
        description: form.description || undefined,
      });
      setSuccess(`Plan "${form.name}" created successfully`);
      setForm({ name: "", priceETB: "", durationMonths: "", description: "" });
      await loadPlans();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to create plan";
      setError(message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await api.patch(`/plans/${id}`, { isActive: !isActive });
    await loadPlans();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-semibold text-primary">
        Subscription Plans
      </h1>

      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface border border-default rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-primary">Create new plan</h2>
        </div>

        {success && (
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        )}

        {error && (
          <div className="text-sm text-error bg-error/10 border border-error/20 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              PLAN NAME
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Semester Pass"
              className="w-full bg-elevated border border-default rounded-xl px-4 py-2.5 text-sm text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              PRICE (ETB)
            </label>
            <input
              value={form.priceETB}
              onChange={(e) => setForm({ ...form, priceETB: e.target.value })}
              placeholder="500"
              type="number"
              min="0"
              className="w-full bg-elevated border border-default rounded-xl px-4 py-2.5 text-sm text-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-secondary mb-1.5">
              DURATION (MONTHS)
            </label>
            <input
              value={form.durationMonths}
              onChange={(e) =>
                setForm({ ...form, durationMonths: e.target.value })
              }
              placeholder="6"
              type="number"
              min="1"
              className="w-full bg-elevated border border-default rounded-xl px-4 py-2.5 text-sm text-primary"
            />
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={
            creating || !form.name || !form.priceETB || !form.durationMonths
          }
          className="flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: "#147878" }}
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {creating ? "Creating..." : "Create plan"}
        </button>
      </motion.div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : (
        <div className="bg-surface border border-default rounded-2xl overflow-hidden">
          {plans.length === 0 ? (
            <p className="text-sm text-muted text-center py-12">
              No plans yet. Create your first plan above.
            </p>
          ) : (
            plans.map((plan, i) => (
              <div
                key={plan.id}
                className={`flex items-center justify-between px-5 py-4
                  ${i < plans.length - 1 ? "border-b border-subtle" : ""}`}
              >
                <div>
                  <p className="text-sm font-medium text-primary">{plan.name}</p>
                  <p className="text-xs text-secondary mt-0.5">
                    {Number(plan.priceETB).toLocaleString()} ETB ·{" "}
                    {plan.durationMonths} months
                  </p>
                </div>
                <button
                  onClick={() => toggleActive(plan.id, plan.isActive)}
                  className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors
                    ${
                      plan.isActive
                        ? "text-green-400 bg-green-500/10"
                        : "text-muted bg-elevated"
                    }`}
                >
                  {plan.isActive ? "Active" : "Inactive"}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
