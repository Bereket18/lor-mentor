import { expect, test } from "@playwright/test";
import {
  DEFAULT_DEV_API_ORIGIN,
  isLocalOrPrivateHostname,
  resolveApiOrigin,
} from "../src/lib/api-base";

/**
 * Focused tests for the NEXT_PUBLIC_API_URL fail-fast (audit findings F-B1/DR-7).
 *
 * The bug being closed: `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"`
 * treated "" as configured, so an empty build arg produced a rewrite with no
 * origin and `new URL("")` inside /api/proxy, and a loopback value was accepted
 * in production where it can never reach the API.
 */

test.describe("resolveApiOrigin — development", () => {
  test("falls back to localhost when the variable is unset", () => {
    expect(resolveApiOrigin({ value: undefined, nodeEnv: "development" })).toBe(
      DEFAULT_DEV_API_ORIGIN,
    );
  });

  test("treats an empty or whitespace value as unset", () => {
    expect(resolveApiOrigin({ value: "", nodeEnv: "development" })).toBe(
      DEFAULT_DEV_API_ORIGIN,
    );
    expect(resolveApiOrigin({ value: "   ", nodeEnv: "development" })).toBe(
      DEFAULT_DEV_API_ORIGIN,
    );
  });

  test("allows a LAN address so a phone on the same network can test", () => {
    expect(
      resolveApiOrigin({ value: "http://192.168.1.20:4000", nodeEnv: "development" }),
    ).toBe("http://192.168.1.20:4000");
  });

  test("still rejects a URL that is not absolute", () => {
    expect(() =>
      resolveApiOrigin({ value: "api.example.com", nodeEnv: "development" }),
    ).toThrow(/absolute URL/);
    // "localhost:4000" parses as the scheme "localhost:", so it is caught by
    // the protocol check rather than the parse — rejected either way.
    expect(() =>
      resolveApiOrigin({ value: "localhost:4000", nodeEnv: "development" }),
    ).toThrow(/must use http or https/);
  });

  test("still rejects a non-http protocol", () => {
    expect(() =>
      resolveApiOrigin({ value: "ftp://api.example.com", nodeEnv: "development" }),
    ).toThrow(/must use http or https/);
  });
});

test.describe("resolveApiOrigin — production", () => {
  test("accepts a public https origin", () => {
    expect(
      resolveApiOrigin({
        value: "https://api.lormentor.com",
        nodeEnv: "production",
      }),
    ).toBe("https://api.lormentor.com");
  });

  test("requires the variable to be set", () => {
    expect(() =>
      resolveApiOrigin({ value: undefined, nodeEnv: "production" }),
    ).toThrow(/must be set to the public API origin in production/);
  });

  test("rejects an empty value instead of falling back", () => {
    expect(() => resolveApiOrigin({ value: "", nodeEnv: "production" })).toThrow(
      /must be set to the public API origin in production/,
    );
    expect(() =>
      resolveApiOrigin({ value: "  ", nodeEnv: "production" }),
    ).toThrow(/must be set to the public API origin in production/);
  });

  test("rejects a malformed value", () => {
    expect(() =>
      resolveApiOrigin({ value: "api.lormentor.com", nodeEnv: "production" }),
    ).toThrow(/absolute URL/);
  });

  test("rejects an origin that carries a path", () => {
    expect(() =>
      resolveApiOrigin({
        value: "https://api.lormentor.com/api/v1",
        nodeEnv: "production",
      }),
    ).toThrow(/bare origin/);
  });

  for (const host of [
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://127.0.1.1",
    "http://0.0.0.0:4000",
    "http://api.localhost",
    "http://[::1]:4000",
    "http://10.0.0.5:4000",
    "http://172.16.4.9:4000",
    "http://192.168.1.20:4000",
    "http://169.254.10.1",
    "http://api", // single-label hostname
  ]) {
    test(`rejects a loopback/private production origin (${host})`, () => {
      expect(() =>
        resolveApiOrigin({ value: host, nodeEnv: "production" }),
      ).toThrow(/loopback or private address/);
    });
  }

  test("the escape hatch permits a loopback origin for local prod-mode smoke tests", () => {
    expect(
      resolveApiOrigin({
        value: "http://localhost:4000",
        nodeEnv: "production",
        allowLocalOrigin: "1",
      }),
    ).toBe("http://localhost:4000");
  });

  test("the escape hatch does not relax syntax checks", () => {
    expect(() =>
      resolveApiOrigin({
        value: "",
        nodeEnv: "production",
        allowLocalOrigin: "1",
      }),
    ).not.toThrow();
    expect(() =>
      resolveApiOrigin({
        value: "api.example.com",
        nodeEnv: "production",
        allowLocalOrigin: "1",
      }),
    ).toThrow(/absolute URL/);
    expect(() =>
      resolveApiOrigin({
        value: "localhost:4000",
        nodeEnv: "production",
        allowLocalOrigin: "1",
      }),
    ).toThrow(/must use http or https/);
  });
});

test.describe("isLocalOrPrivateHostname", () => {
  test("classifies loopback, private and public hosts", () => {
    expect(isLocalOrPrivateHostname("localhost")).toBe(true);
    expect(isLocalOrPrivateHostname("127.0.0.1")).toBe(true);
    expect(isLocalOrPrivateHostname("192.168.0.1")).toBe(true);
    expect(isLocalOrPrivateHostname("172.20.3.4")).toBe(true);
    expect(isLocalOrPrivateHostname("172.32.3.4")).toBe(false); // outside RFC 1918
    expect(isLocalOrPrivateHostname("api.lormentor.com")).toBe(false);
    expect(isLocalOrPrivateHostname("8.8.8.8")).toBe(false);
  });
});
