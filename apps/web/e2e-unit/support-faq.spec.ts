import { expect, test } from "@playwright/test";
import {
  searchFaq,
  SUPPORT_EXPECTED_REPLY_NOTE,
  SUPPORT_FAQ_ARTICLES,
  SUPPORT_FAQ_IS_DRAFT,
} from "../src/lib/support-faq";

test.describe("help-centre content", () => {
  test("ships the twelve drafted articles with every category represented", () => {
    expect(SUPPORT_FAQ_ARTICLES).toHaveLength(12);
    const categories = new Set(SUPPORT_FAQ_ARTICLES.map((a) => a.category));
    expect(categories).toEqual(
      new Set(["PAYMENT", "ACCOUNT", "COURSE", "TECHNICAL", "OTHER"]),
    );
  });

  test("is still marked as a draft for the college to review", () => {
    // Flip this test when the content is approved and the banner is removed.
    expect(SUPPORT_FAQ_IS_DRAFT).toBe(true);
  });

  test("the one reply-time sentence promises no number", () => {
    expect(SUPPORT_EXPECTED_REPLY_NOTE).not.toMatch(/\d/);
    expect(SUPPORT_EXPECTED_REPLY_NOTE.toLowerCase()).not.toContain(
      "within",
    );
    expect(SUPPORT_EXPECTED_REPLY_NOTE.toLowerCase()).not.toContain(
      "business day",
    );
  });

  test("every article has a question, an answer and unique id", () => {
    const ids = new Set<string>();
    for (const article of SUPPORT_FAQ_ARTICLES) {
      expect(article.question.trim().length).toBeGreaterThan(10);
      expect(article.answer.length).toBeGreaterThan(0);
      expect(ids.has(article.id)).toBe(false);
      ids.add(article.id);
    }
  });
});

test.describe("searchFaq", () => {
  test("returns everything for an empty search", () => {
    expect(searchFaq("")).toHaveLength(SUPPORT_FAQ_ARTICLES.length);
  });

  test("matches the question, body and hidden keywords", () => {
    expect(searchFaq("under review").length).toBeGreaterThan(0);
    expect(searchFaq("5 mb").map((a) => a.id)).toContain(
      "attachments-privacy",
    );
    expect(searchFaq("chapa").length).toBeGreaterThan(0);
  });

  test("filters by category and combines with the term", () => {
    const payments = searchFaq("", "PAYMENT");
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((a) => a.category === "PAYMENT")).toBe(true);
    expect(searchFaq("password", "TECHNICAL")).toHaveLength(0);
  });

  test("is case-insensitive and trims surrounding space", () => {
    expect(searchFaq("  PENDING  ").length).toBe(searchFaq("pending").length);
  });
});
