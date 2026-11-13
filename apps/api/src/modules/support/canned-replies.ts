/**
 * Canned replies for the staff inbox.
 *
 * Static on purpose for now: the queue needs a fast way to answer the same ten
 * questions without a settings screen. Nothing here is secret - the list is
 * served only to ADMIN/SUPER_ADMIN - and no entry promises a response time,
 * a refund, or an outcome the college has not agreed to.
 *
 * Editing: add an object, keep `id` stable (the UI remembers the last one
 * used), and keep the bodies plain text - they are inserted into the composer
 * and escaped like any other message once sent.
 */

export interface CannedReply {
  id: string;
  title: string;
  body: string;
  /** Which ticket category this fits, so the admin UI can float it first. */
  category: 'PAYMENT' | 'ACCOUNT' | 'COURSE' | 'TECHNICAL' | 'OTHER';
}

export const CANNED_REPLIES: CannedReply[] = [
  {
    id: 'payment-pending',
    title: 'Payment still pending',
    category: 'PAYMENT',
    body: `Thank you for the details. Your payment is still showing as pending on our side, which means it has not been matched to your account yet.

Please send us the bank transaction reference (the FT or transaction number on the receipt) or the Chapa reference if you paid online, and we will trace it. Please do not send the same receipt a second time while we are checking.`,
  },
  {
    id: 'payment-receipt-rejected',
    title: 'Receipt was rejected',
    category: 'PAYMENT',
    body: `Thank you for writing in. The receipt you submitted could not be matched to a payment we received, so it was rejected.

Please check that the receipt shows the full bank transaction reference, the amount, and the date, then submit a clear photo or screenshot of the whole receipt from the payment page. If you are sure the payment left your account, send us the transaction reference and we will trace it with the bank.`,
  },
  {
    id: 'payment-which-receipts-work',
    title: 'Which receipts we can accept',
    category: 'PAYMENT',
    body: `We can only match receipts that show a bank transaction reference (the FT or transaction number), the amount paid, and the date.

Screenshots of a mobile banking confirmation can work if that reference is visible. A screenshot of a balance or a message that only says "payment successful" without a reference is not enough for us to match the money to your account.`,
  },
  {
    id: 'payment-wrong-amount',
    title: 'Paid a different amount',
    category: 'PAYMENT',
    body: `Thank you for flagging this. If the amount you paid is different from the plan price, the payment goes to manual review rather than being approved automatically, so it can take longer.

Please confirm which plan you meant to buy and the amount you actually paid. We will either match it to the plan or tell you what is still outstanding before the subscription can start.`,
  },
  {
    id: 'account-verification-code',
    title: 'Verification code did not arrive',
    category: 'ACCOUNT',
    body: `Please check the spam or junk folder first, and make sure the address on your account is spelled correctly.

If the code still has not arrived after a few minutes, request a new one from the verification page. Codes expire, so use the newest one. If you are still stuck, reply here and we will check the address on your account from our side.`,
  },
  {
    id: 'account-cannot-sign-in',
    title: 'Cannot sign in',
    category: 'ACCOUNT',
    body: `Please try the "Forgot password" link on the sign-in page and follow the emailed reset link.

If the reset email does not arrive, check your spam folder and confirm you are using the address you registered with. Reply here with the email address on the account and we will check whether it is verified and active.`,
  },
  {
    id: 'account-wrong-details',
    title: 'Name or details are wrong',
    category: 'ACCOUNT',
    body: `Thank you for letting us know. Please tell us exactly which detail is wrong and what it should be.

For a name or student number change we may need to confirm it against the college register before updating the account.`,
  },
  {
    id: 'course-access-missing',
    title: 'Course or materials not visible',
    category: 'COURSE',
    body: `Please tell us which course or material you expected to see, and whether it was visible before.

Access to a course depends on your enrolment and on the subscription being active. We will check both from our side and let you know what is missing.`,
  },
  {
    id: 'subscription-not-active',
    title: 'Subscription not active after paying',
    category: 'PAYMENT',
    body: `Thank you for the details. A subscription starts only after the payment is approved, and a receipt that is still pending or in review does not activate it yet.

Please send the transaction reference so we can check the payment. Once it is approved, access is applied to the account automatically.`,
  },
  {
    id: 'technical-broken-page',
    title: 'Something is not working',
    category: 'TECHNICAL',
    body: `Thank you for reporting this. To help us reproduce it, please tell us which page you were on, what you expected to happen, and what happened instead.

A screenshot of the error is useful if you can attach one. If it happens on one device only, please mention the browser and whether you are on mobile data or college wifi.`,
  },
  {
    id: 'technical-image-upload',
    title: 'Image upload will not go through',
    category: 'TECHNICAL',
    body: `Uploads accept JPEG, PNG, or WebP images up to 5 MB each, and up to three per message.

If your file is a different format or larger than that, please convert or resize it and try again. A screenshot taken on the phone is usually a JPEG or PNG and will work.`,
  },
  {
    id: 'other-need-more-info',
    title: 'Ask for more detail',
    category: 'OTHER',
    body: `Thank you for getting in touch. To look into this properly we need a little more detail: what you were trying to do, what happened, and when it happened.

If it relates to a payment, please include the transaction reference.`,
  },
];

/** Lookup for the service tests and for the admin UI's "insert" action. */
export function findCannedReply(id: string): CannedReply | undefined {
  return CANNED_REPLIES.find((reply) => reply.id === id);
}
