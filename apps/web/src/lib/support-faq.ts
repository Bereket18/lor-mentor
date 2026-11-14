import type { SupportCategory } from "./support-types";

/**
 * DRAFT help-centre content.
 *
 * ⚠ These articles are a draft for the college to review before publishing.
 * Every statement here was checked against the real code paths in
 * `apps/api/src/modules/payments` and `apps/api/src/modules/support` (manual
 * receipt review, exact-amount matching, one-payment-at-a-time, attachment
 * limits, retention), but policy wording is the college's decision. Keep this
 * file honest: if a rule changes in code, change it here in the same commit.
 *
 * Never add a response-time promise. `SUPPORT_EXPECTED_REPLY_NOTE` below is
 * the one place the expectation is worded, and it deliberately gives no number.
 */

/**
 * The single sentence describing when a reply arrives.
 *
 * Configurable in one place on purpose. It must NOT promise hours or days:
 * support is staffed by the college and an SLA here would become a promise the
 * product cannot keep. If a future owner agrees a real SLA, change this string
 * and the published policy together.
 */
export const SUPPORT_EXPECTED_REPLY_NOTE =
  "We answer as soon as we can. There is no guaranteed response time, and you do not need to open a second ticket for the same issue.";

/** Shown next to the help centre heading while the content is a draft. */
export const SUPPORT_FAQ_IS_DRAFT = true;

export interface FaqArticle {
  id: string;
  category: SupportCategory;
  question: string;
  /** Paragraphs; rendered with whitespace between them. */
  answer: string[];
  /** Extra search terms (not displayed). */
  keywords: string[];
}

export const SUPPORT_FAQ_ARTICLES: FaqArticle[] = [
  {
    id: "payment-still-pending",
    category: "PAYMENT",
    question: "I paid but my payment still says PENDING. What happens now?",
    answer: [
      "A bank-transfer receipt is checked and then reviewed by a person. While that review is open the payment shows as PENDING, and your subscription activates automatically once it is approved.",
      "You do not need to submit the receipt again. Sending the same receipt twice is rejected by the system. If the payment has been pending for more than two days, open a ticket with the transaction reference and the college will trace it.",
    ],
    keywords: ["pending", "waiting", "manual", "bank", "receipt", "review"],
  },
  {
    id: "receipt-rejected",
    category: "PAYMENT",
    question: "My receipt was rejected. Why?",
    answer: [
      "A receipt is rejected when the college cannot match it to a payment it received. The common reasons are: the amount is less than the plan price, the receiving account does not belong to the college, the reference is missing or unreadable, or the same receipt was already submitted.",
      "Open the payment page and submit a clear, full photo or screenshot of the whole receipt, showing the bank transaction reference, the amount and the date. If you are sure the money left your account, open a ticket and include the reference — do not keep resubmitting the same image.",
    ],
    keywords: ["rejected", "refused", "receipt", "amount", "reference"],
  },
  {
    id: "paid-online-not-active",
    category: "PAYMENT",
    question: "I paid online with Chapa but my account is not active yet.",
    answer: [
      "Online payments activate after the gateway confirmation reaches the college. That is usually quick, but a confirmation can lag. Wait a little and check the payment page again — do not pay a second time.",
      "Money the gateway confirmed but the college could not approve automatically is marked under review: the payment is kept and any refund is handled by the college. If nothing changes after 30 minutes, open a ticket with the payment reference shown on the payment page.",
    ],
    keywords: ["chapa", "online", "active", "confirmation", "under review", "paid twice"],
  },
  {
    id: "exact-amount",
    category: "PAYMENT",
    question: "Which amount should I pay?",
    answer: [
      "Pay the exact plan price shown on the payment page. Amounts are compared exactly — there is no tolerance band.",
      "Underpaying is rejected with the shortfall shown, because the subscription price has not been met. Overpaying is not approved automatically: the excess is recorded and the receipt goes to manual review so the college can decide whether to refund or credit it.",
    ],
    keywords: ["amount", "price", "underpay", "overpay", "shortfall", "excess", "refund"],
  },
  {
    id: "cancel-online-payment",
    category: "PAYMENT",
    question: "Can I cancel an online payment I started?",
    answer: [
      "An open Chapa checkout can be cancelled from your profile while it is still PENDING. A checkout you simply leave is closed as EXPIRED after the gateway retry window.",
      "Cancelling does not cancel money that has already left your account. A late confirmation can still approve a checkout the college had marked expired, so if you paid, do not start a second payment — open a ticket with the reference.",
    ],
    keywords: ["cancel", "expired", "checkout", "chapa", "started"],
  },
  {
    id: "one-payment-at-a-time",
    category: "PAYMENT",
    question: "Why can I not start a new payment?",
    answer: [
      "Only one payment can be in progress at a time. A pending bank receipt, or an online checkout that is still open, blocks a new one until it is approved, rejected, cancelled or expired.",
      "This is deliberate: it prevents paying twice for the same subscription. Finish or cancel the existing payment, or wait for the college's decision, then try again.",
    ],
    keywords: ["blocked", "new payment", "in progress", "pending", "duplicate"],
  },
  {
    id: "attachments-privacy",
    category: "TECHNICAL",
    question: "What can I attach to a ticket, and who can see it?",
    answer: [
      "Up to three images per message, each 5 MB or smaller: JPEG, PNG or WebP. The college re-encodes every image before storing it and rejects files that are not really images.",
      "Attachments are private. They are never served as public website files: only you and the college's support staff can open them, through an authenticated route. They are kept with the closed ticket and deleted by the college's retention job 180 days after the ticket is closed.",
    ],
    keywords: ["attachment", "image", "photo", "privacy", "retention", "size", "5 mb"],
  },
  {
    id: "cannot-sign-in",
    category: "ACCOUNT",
    question: "I cannot sign in to my account.",
    answer: [
      "Use the password-reset link on the sign-in page and check your spam folder for the email. If you registered but never verified your address, follow the verification link in the original email.",
      "If the reset email does not arrive, or the account says it is inactive, open a ticket from a working account if you have one — or ask the college office to contact support on your behalf. Never send your password in a ticket.",
    ],
    keywords: ["login", "sign in", "password", "reset", "inactive", "verify"],
  },
  {
    id: "change-details",
    category: "ACCOUNT",
    question: "How do I change my name or email address?",
    answer: [
      "Some details can be changed from your profile. Your email address identifies your account, so a change may need the college to verify it first.",
      "Open a ticket from the account and say exactly what should change. Do not open a ticket from a second account asking about the first: support can only discuss an account with the person signed in to it.",
    ],
    keywords: ["name", "email", "profile", "change", "account"],
  },
  {
    id: "course-material-missing",
    category: "COURSE",
    question: "A course or material is missing from my account.",
    answer: [
      "Check that your subscription is active and that you are signed in to the account that paid. Materials appear only for published courses assigned to your cohort.",
      "If your subscription is active and the item is still missing, open a ticket with the course name, the item name and a screenshot of what you see. That is usually enough for the college to fix it without a second round of questions.",
    ],
    keywords: ["course", "material", "missing", "published", "subscription"],
  },
  {
    id: "technical-problem",
    category: "TECHNICAL",
    question: "Something in the app is broken. What should I include?",
    answer: [
      "Tell us what you were doing, what you expected, and what happened instead. Include the page address, the time it happened, your browser and phone or computer, and a screenshot if you can.",
      "If the problem is about a payment, include the payment reference. If it is about a ticket, include the ticket number (for example T-000123). One clear ticket with those details is more useful than several short ones.",
    ],
    keywords: ["bug", "broken", "error", "screenshot", "browser", "technical"],
  },
  {
    id: "how-tickets-work",
    category: "OTHER",
    question: "How do support tickets work?",
    answer: [
      "A ticket is one conversation. You write, the college replies, and you reply again in the same thread until the problem is solved. Replies also arrive by email and as an in-app notification, but the full conversation always lives in the app.",
      "Mark the ticket resolved when it is handled. You can reply and reopen a resolved ticket for 14 days; after that it becomes read-only, and a new problem should be a new ticket that refers to the old number.",
    ],
    keywords: ["ticket", "conversation", "resolved", "reopen", "closed", "email"],
  },
];

export const SUPPORT_FAQ_CATEGORY_ORDER: Array<{
  value: SupportCategory | "ALL";
  label: string;
}> = [
  { value: "ALL", label: "All topics" },
  { value: "PAYMENT", label: "Payments" },
  { value: "ACCOUNT", label: "Account" },
  { value: "COURSE", label: "Courses" },
  { value: "TECHNICAL", label: "Technical" },
  { value: "OTHER", label: "Other" },
];

/** Case-insensitive search over the question, answer text and keywords. */
export function searchFaq(
  query: string,
  category: SupportCategory | "ALL" = "ALL",
): FaqArticle[] {
  const term = query.trim().toLowerCase();
  return SUPPORT_FAQ_ARTICLES.filter((article) => {
    if (category !== "ALL" && article.category !== category) return false;
    if (!term) return true;
    const haystack = [
      article.question,
      ...article.answer,
      ...article.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}
