import { createElement, type ReactElement } from "react";
import {
  confirmationEndStateMessage,
  paymentUnderReviewMessage,
} from "../../lib/payment-confirmation";

/**
 * Renders the one definitive sentence a student sees after the polling window
 * for a payment whose confirmation is still pending.
 *
 * Deliberately JSX-free (and dependency-free) so the Playwright unit suite can
 * render it with `react-dom/server` and assert the exact output; Playwright's
 * test transform owns JSX and cannot render React components written with it.
 */
export function ConfirmationEndStateMessage({
  reference,
  className,
}: {
  reference: string;
  className?: string;
}): ReactElement {
  return createElement(
    "p",
    { className: className ?? "text-sm text-secondary" },
    confirmationEndStateMessage(reference),
  );
}

/**
 * Renders the fixed "payment received, under review" sentence for a payment
 * whose money the gateway confirmed but which cannot be approved automatically.
 * JSX-free for the same reason as above, so the unit suite can assert the
 * exact wording the student sees.
 */
export function PaymentUnderReviewMessage({
  reference,
  className,
}: {
  reference: string;
  className?: string;
}): ReactElement {
  return createElement(
    "p",
    { className: className ?? "text-sm text-secondary" },
    paymentUnderReviewMessage(reference),
  );
}
