# LOR MENTOR — IN-APP ALERT / CONFIRMATION POLICY

**Date:** 2026-10-19 · **Scope:** all web product screens · **Status:** enforced

## Rule

The LOR Mentor web app does not use native browser dialogs
(`window.alert`, `window.confirm`, `window.prompt`) anywhere in product UI.

- **Destructive or consequential actions** use the themed
  `ConfirmDialogProvider` (`apps/web/src/components/ui/confirm-dialog-provider.tsx`)
  through the `useConfirm()` hook. It returns a promise and supports a title,
  explanatory description, custom labels, and a red destructive treatment.
- **Destructive actions that require typed input** (currently only the
  SUPER_ADMIN payment reversal reason) use the themed `Dialog` primitive with
  a red submit button — `ConfirmDialogProvider` has no input field. The
  native-dialog ban still applies to those screens.
- **Success / error / informational feedback** uses `sonner` toasts, inline
  page messages, or the review/success screens. Toasts never block the page.
- **Money-flow warnings** (underpayment, amount mismatch, manual review) are
  inline in the payment result screen or in the admin review evidence panel,
  not in a browser popup.
- New code must not introduce `alert()`, `confirm()`, or `prompt()`. This is
  checked by searching `apps/web/src` for those calls during review.

## Covered actions (Rev 5, extended Rev 8)

| Screen | Action | Replaced native dialog |
|---|---|---|
| `/admin/users` | Delete a user permanently | yes |
| `/admin/banks` | Remove an accepted bank | yes |
| `/admin/banks` | Clear a bank receiving account | yes |
| `/admin/courses` | Delete a course material | yes |
| `/teacher/courses` | Delete a course material | yes |
| `/forum` | Remove a thread | yes |
| `/forum` | Remove a reply | yes |
| `/admin/payments` | Reverse an approved payment (SUPER_ADMIN; mandatory reason) | yes (themed `Dialog` with reason field) |

## External pages are out of scope

`checkout.chapa.co` is a hosted page on Chapa's origin. Its own
`beforeunload` prompt when the checkout tab/window is closed cannot be removed
by LOR Mentor. The app-side guarantees are:

1. checkout is initialized only after an explicit click on the Pay button;
2. an initialized checkout is internal and is not shown to admins or in the
   student's history until Chapa confirms a payment;
3. no LOR Mentor screen opens a native browser dialog.

If Chapa changes or removes that prompt, the app needs no change.

## Verification

- `git grep --untracked -n -E "window\.(alert|confirm|prompt)|\balert\(" -- apps/web/src`
  returns only the explanatory comment in
  `components/ui/confirm-dialog-provider.tsx` (no product call sites).
- Web build (`npm run build --workspace=apps/web`) exits 0.
- Regression detail: `REGRESSION-TEST-RESULTS.md` §11 (Rev 5); §14 (Rev 8 —
  reversal dialog, admin UX).
