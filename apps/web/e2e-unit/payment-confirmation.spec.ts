import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConfirmationEndStateMessage } from "../src/components/payment/confirmation-end-state";
import { confirmationEndStateMessage } from "../src/lib/payment-confirmation";

const REFERENCE = "lm-0b6f4c1e-2f6d-4a9e-9d0e-123456789abc";

test("renders the exact definitive end state, never a failure", () => {
  const html = renderToStaticMarkup(
    createElement(ConfirmationEndStateMessage, { reference: REFERENCE }),
  );

  expect(confirmationEndStateMessage(REFERENCE)).toBe(
    "We are still confirming your payment. You will receive a notification " +
      "when your subscription is active. If nothing changes in 30 minutes, " +
      "contact support and quote reference " +
      REFERENCE +
      ".",
  );
  expect(html).toContain(confirmationEndStateMessage(REFERENCE));
  // A confirmed-pending payment must never be presented as failed/aborted.
  expect(html).not.toMatch(/not completed|failed|could not be confirmed/i);
});
