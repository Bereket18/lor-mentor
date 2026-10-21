"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Loader2,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import api from "@/lib/api";
import { useConfirm } from "@/components/ui/confirm-dialog-provider";
import { toast } from "sonner";

interface CatalogBank {
  code: string;
  label: string;
  input: "cbe" | "ref" | "url";
  auto: boolean;
  accountDigits?: number;
  adopted: boolean;
  isActive: boolean;
  accountNumber: string | null;
  accountName: string | null;
}

export default function AdminBanksPage() {
  const confirm = useConfirm();
  const [banks, setBanks] = useState<CatalogBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [accountEditing, setAccountEditing] = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const applyList = useCallback((list: CatalogBank[]) => {
    setBanks(list);
    setSelected((cur) => {
      if (cur && list.some((b) => b.code === cur && !b.adopted)) return cur;
      return list.find((b) => !b.adopted)?.code ?? "";
    });
  }, []);

  const fetchBanks = useCallback(async () => {
    const res = await api.get("/payments/admin/banks");
    return Array.isArray(res.data) ? (res.data as CatalogBank[]) : [];
  }, []);

  // Load in a promise callback so the effect itself does not synchronously
  // trigger React state updates.
  useEffect(() => {
    let active = true;
    fetchBanks()
      .then((list) => {
        if (active) applyList(list);
      })
      .catch(() => toast.error("Could not load the payment bank catalog"))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyList, fetchBanks]);

  const adopted = banks.filter((b) => b.adopted);
  const available = banks.filter((b) => !b.adopted);

  async function run(
    code: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ): Promise<boolean> {
    setBusy(code);
    try {
      await action();
      applyList(await fetchBanks());
      toast.success(successMessage);
      return true;
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Something went wrong. Please try again.";
      toast.error(message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function addBank() {
    if (!selected) return;
    const bank = banks.find((b) => b.code === selected);
    void run(
      selected,
      () => api.post("/payments/admin/banks", { code: selected }),
      `${bank?.label ?? selected} added`,
    );
  }

  function toggleBank(bank: CatalogBank) {
    void run(
      bank.code,
      () =>
        api.patch(`/payments/admin/banks/${bank.code}`, {
          isActive: !bank.isActive,
        }),
      bank.isActive
        ? `${bank.label} hidden from students`
        : `${bank.label} enabled`,
    );
  }

  async function removeBank(bank: CatalogBank) {
    const confirmed = await confirm({
      title: `Remove ${bank.label}?`,
      description:
        "Students will no longer be able to select this bank for new payments. Existing payments are not affected.",
      confirmLabel: "Remove bank",
      destructive: true,
    });
    if (!confirmed) return;
    await run(
      bank.code,
      () => api.delete(`/payments/admin/banks/${bank.code}`),
      `${bank.label} removed`,
    );
  }

  function startEditAccount(bank: CatalogBank) {
    setAccountEditing(bank.code);
    setAccountNumber(bank.accountNumber ?? "");
    setAccountName(bank.accountName ?? "");
  }

  function cancelEditAccount() {
    setAccountEditing(null);
    setAccountNumber("");
    setAccountName("");
  }

  async function saveAccount(bank: CatalogBank) {
    const value = accountNumber.trim();
    if (value.replace(/\D/g, "").length < 8) {
      toast.error("Enter the full receiving account number (at least 8 digits).");
      return;
    }

    const saved = await run(
      bank.code,
      () =>
        api.patch(`/payments/admin/banks/${bank.code}/account`, {
          accountNumber: value,
          accountName: accountName.trim() || undefined,
        }),
      `${bank.label} receiving account saved`,
    );
    if (saved) cancelEditAccount();
  }

  async function clearAccount(bank: CatalogBank) {
    const confirmed = await confirm({
      title: `Remove the ${bank.label} receiving account?`,
      description:
        "Students will no longer see this account on the transfer panel. Server-configured fallback accounts are used only for matching old receipts and are not shown to students.",
      confirmLabel: "Remove account",
      destructive: true,
    });
    if (!confirmed) return;
    if (accountEditing === bank.code) cancelEditAccount();
    await run(
      bank.code,
      () => api.delete(`/payments/admin/banks/${bank.code}/account`),
      `${bank.label} receiving account removed`,
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-primary">
          Payment banks
        </h1>
        <p className="text-sm text-secondary mt-1">
          Choose the banks the college accepts and set the college receiving
          account for each one. Students only see enabled banks. Banks marked{" "}
          <strong>automatic verification</strong> are confirmed with the bank
          when a receipt is submitted; manual-review banks are queued for an
          admin to check.
        </p>
        <p className="text-xs text-muted mt-2">
          Receiving accounts saved here are shown to students and matched
          against the receiver on bank receipts. Accounts configured in the
          server environment are used only as a legacy matching fallback for
          old receipts; they are never listed as transfer destinations.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted" />
        </div>
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface border border-default rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-primary">
                Add a bank
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={available.length === 0 || busy !== null}
                className="flex-1 bg-elevated border border-default rounded-xl px-4 py-2.5 text-sm text-primary disabled:opacity-50"
              >
                {available.length === 0 ? (
                  <option value="">All catalog banks are already added</option>
                ) : (
                  available.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.label}
                      {b.auto ? "" : " — manual review"}
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={addBank}
                disabled={!selected || busy !== null}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: "#147878" }}
              >
                {busy === selected ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add bank
              </button>
            </div>

            <p className="text-xs text-muted">
              The catalog follows Cheki&apos;s supported bank list. Banks without
              an automated lookup can still be accepted — references from those
              banks always go to manual review.
            </p>
          </motion.div>

          <div className="bg-surface border border-default rounded-2xl divide-y divide-default overflow-hidden">
            {adopted.length === 0 ? (
              <p className="p-5 text-sm text-secondary">
                No banks are accepted yet. Add one above so students can pay by
                bank transfer.
              </p>
            ) : (
              adopted.map((bank) => (
                <div key={bank.code} className="p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-primary">
                        {bank.label}
                      </p>
                      <p className="text-xs text-muted flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {bank.auto ? (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 text-green-400" />
                            Automatic verification
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            Manual review
                          </>
                        )}
                        <span aria-hidden>·</span>
                        <code>{bank.code}</code>
                      </p>
                    </div>

                    <span
                      className={`inline-flex items-center self-start sm:self-auto text-xs px-2 py-1 rounded-lg border ${
                        bank.isActive
                          ? "text-green-400 border-green-500/20 bg-green-500/10"
                          : "text-muted border-default bg-elevated"
                      }`}
                    >
                      {bank.isActive ? "Enabled" : "Hidden"}
                    </span>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        onClick={() => toggleBank(bank)}
                        disabled={busy !== null}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-default text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
                      >
                        {busy === bank.code ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : bank.isActive ? (
                          "Hide"
                        ) : (
                          "Enable"
                        )}
                      </button>
                      <button
                        onClick={() => void removeBank(bank)}
                        disabled={busy !== null}
                        aria-label={`Remove ${bank.label}`}
                        className="p-1.5 rounded-lg border border-default text-muted hover:text-error hover:border-error/30 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-default bg-elevated px-3 py-2.5">
                    {accountEditing === bank.code ? (
                      <div className="space-y-2">
                        <div className="grid sm:grid-cols-2 gap-2">
                          <input
                            aria-label={`Receiving account for ${bank.label}`}
                            inputMode="numeric"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            placeholder="Full receiving account number"
                            className="w-full bg-surface border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                          />
                          <input
                            aria-label={`Account name for ${bank.label}`}
                            value={accountName}
                            onChange={(e) => setAccountName(e.target.value)}
                            placeholder="Account name (optional)"
                            className="w-full bg-surface border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none"
                          />
                        </div>
                        <p className="text-xs text-muted">
                          Enter the full account number (at least 8 digits).
                          {bank.accountDigits
                            ? ` Cheki uses the last ${bank.accountDigits} digits for the bank lookup.`
                            : ""}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void saveAccount(bank)}
                            disabled={busy !== null}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                            style={{ backgroundColor: "#147878" }}
                          >
                            {busy === bank.code ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Save account"
                            )}
                          </button>
                          <button
                            onClick={cancelEditAccount}
                            disabled={busy !== null}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-default text-secondary hover:text-primary transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : bank.accountNumber ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted">
                            College receiving account
                          </p>
                          <p className="font-mono text-sm text-primary break-all">
                            {bank.accountNumber}
                          </p>
                          {bank.accountName && (
                            <p className="text-xs text-muted">
                              {bank.accountName}
                            </p>
                          )}
                          {bank.accountDigits && (
                            <p className="text-xs text-muted">
                              Cheki lookup uses the last {bank.accountDigits}{" "}
                              digits.
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEditAccount(bank)}
                            disabled={busy !== null}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-default text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            onClick={() => void clearAccount(bank)}
                            disabled={busy !== null}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-default text-muted hover:text-error hover:border-error/30 transition-colors disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <p className="flex-1 text-xs text-muted">
                          No college receiving account set for this bank.
                        </p>
                        <button
                          onClick={() => startEditAccount(bank)}
                          disabled={busy !== null}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-default text-secondary hover:text-primary hover:border-accent/40 transition-colors disabled:opacity-50"
                        >
                          Set account
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
