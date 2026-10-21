"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the red destructive treatment for irreversible actions. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirmation {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-wide replacement for window.confirm(). Native browser dialogs are not
 * used anywhere in the product: they cannot be styled, block the whole tab,
 * and are especially disruptive on mobile. Every confirmation goes through
 * this themed dialog instead.
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending((current) => {
        // A second request while one is open cancels the first safely.
        current?.resolve(false);
        return { options, resolve };
      });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const options = pending?.options;
  const destructive = options?.destructive === true;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-md gap-5 border border-default bg-surface p-5 text-primary"
        >
          <DialogHeader>
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  destructive
                    ? "bg-error/10 text-error"
                    : "bg-accent/10 text-accent"
                }`}
              >
                {destructive ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <HelpCircle className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-base text-primary">
                  {options?.title ?? ""}
                </DialogTitle>
                {options?.description ? (
                  <DialogDescription className="mt-1.5 text-sm leading-relaxed text-secondary">
                    {options.description}
                  </DialogDescription>
                ) : null}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="mx-0 mb-0 gap-2 rounded-none border-0 bg-transparent p-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
              className="border-default text-secondary hover:text-primary"
            >
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              onClick={() => close(true)}
              className={
                destructive
                  ? "bg-error text-white hover:bg-error/90"
                  : "bg-accent text-white hover:bg-accent-hover"
              }
            >
              {options?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used inside ConfirmDialogProvider");
  }
  return confirm;
}
