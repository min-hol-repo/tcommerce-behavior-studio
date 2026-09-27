import { describe, expect, it } from "vitest";
import { aggregateEvents } from "./analytics.ts";
import type { DemoEvent } from "./contracts.ts";

const runId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

function event(overrides: Partial<DemoEvent>): DemoEvent {
  return {
    eventId: crypto.randomUUID(),
    schemaVersion: 1,
    demoRunId: runId,
    anonymousViewerId: "viewer-1",
    sessionId,
    sequence: 1,
    channelId: "T-COMMERCE",
    broadcastId: "tcommerce-live-001",
    eventType: "channel_enter",
    occurredAt: "2026-09-14T00:00:00.000Z",
    playbackPositionMs: 0,
    source: "manual",
    ...overrides,
  };
}

describe("aggregateEvents", () => {
  it("calculates an explicit exit journey without treating it as active", () => {
    const events = [
      event({ sequence: 1 }),
      event({ sequence: 2, eventType: "remote_key", remoteKey: "OK", screenId: "watch", occurredAt: "2026-09-14T00:00:05.000Z" }),
      event({ sequence: 3, eventType: "product_view", productId: "pan-set-01", occurredAt: "2026-09-14T00:00:07.000Z" }),
      event({ sequence: 4, eventType: "channel_exit", exitReason: "channel_change", occurredAt: "2026-09-14T00:00:10.000Z" }),
    ];

    const summary = aggregateEvents(events, runId, new Date("2026-09-14T00:00:15.000Z"));

    expect(summary.metrics).toMatchObject({ entries: 1, explicitExits: 1, activeSessions: 0, remoteKeys: 1, interestedSessions: 1 });
    expect(summary.metrics.productReachRate).toBe(1);
    expect(summary.metrics.averageDwellSeconds).toBe(10);
  });

  it("uses the event occurrence time, not a late receive time, for active sessions", () => {
    const stale = { ...event({ occurredAt: "2026-09-14T00:00:00.000Z" }), receivedAt: new Date("2026-09-14T00:01:00.000Z") };
    const summary = aggregateEvents([stale], runId, new Date("2026-09-14T00:01:00.000Z"));
    expect(summary.metrics.activeSessions).toBe(0);
  });
});
