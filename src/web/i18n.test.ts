import { describe, expect, it } from "vitest";
import { eventLabel, interpolate, resolveLanguage, translations } from "./i18n.ts";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, nested]) => keys(nested, prefix ? `${prefix}.${key}` : key));
}

describe("translations", () => {
  it("keeps Korean and English translation keys aligned", () => {
    expect(keys(translations.ko).sort()).toEqual(keys(translations.en).sort());
  });

  it("interpolates dynamic values", () => {
    expect(interpolate("{count} events", { count: 12 })).toBe("12 events");
  });

  it("localizes event labels", () => {
    const event = { eventType: "remote_key" as const, remoteKey: "OK" as const };
    expect(eventLabel("ko", event)).toBe("리모컨 OK");
    expect(eventLabel("en", event)).toBe("Remote OK");
  });

  it("resolves dedicated language pages with English as the default", () => {
    expect(resolveLanguage("/en")).toBe("en");
    expect(resolveLanguage("/ko")).toBe("ko");
    expect(resolveLanguage("/repo/ko/")).toBe("ko");
    expect(resolveLanguage("/")).toBe("en");
    expect(resolveLanguage("/", "?lang=ko")).toBe("ko");
  });
});
