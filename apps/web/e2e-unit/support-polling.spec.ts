import { expect, test } from "@playwright/test";
import {
  SUPPORT_POLL_INTERVAL_MS,
  SUPPORT_POLL_MAX_BACKOFF_MS,
  supportPollInterval,
} from "../src/hooks/use-support-polling";

test.describe("supportPollInterval", () => {
  test("polls every 30 seconds while healthy", () => {
    expect(SUPPORT_POLL_INTERVAL_MS).toBe(30_000);
    expect(supportPollInterval(0)).toBe(30_000);
  });

  test("doubles the wait for each consecutive failure", () => {
    expect(supportPollInterval(1)).toBe(60_000);
    expect(supportPollInterval(2)).toBe(120_000);
    expect(supportPollInterval(3)).toBe(240_000);
  });

  test("caps the backoff at five minutes", () => {
    expect(SUPPORT_POLL_MAX_BACKOFF_MS).toBe(300_000);
    expect(supportPollInterval(4)).toBe(300_000);
    expect(supportPollInterval(99)).toBe(300_000);
  });

  test("tolerates nonsense counts without stalling or exploding", () => {
    expect(supportPollInterval(-3)).toBe(30_000);
    expect(supportPollInterval(Number.NaN)).toBe(30_000);
    expect(supportPollInterval(2.9)).toBe(120_000);
  });
});
