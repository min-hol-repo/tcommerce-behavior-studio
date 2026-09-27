import type { DemoEvent } from "./contracts.ts";

export type Summary = {
  asOf: string;
  demoRunId: string;
  metrics: {
    entries: number;
    explicitExits: number;
    activeSessions: number;
    remoteKeys: number;
    interestedSessions: number;
    productReachRate: number | null;
    averageDwellSeconds: number | null;
    ingestionRate: number;
  };
  timeline: Array<{ second: string; entries: number; exits: number; remoteKeys: number }>;
  remoteKeys: Array<{ key: string; count: number }>;
  products: Array<{ productId: string; count: number }>;
};

export function aggregateEvents(events: Array<DemoEvent & { receivedAt?: Date }>, demoRunId: string, now = new Date()): Summary {
  const sessions = new Map<string, DemoEvent[]>();
  const remoteKeys = new Map<string, number>();
  const products = new Map<string, number>();
  const timeline = new Map<string, { entries: number; exits: number; remoteKeys: number }>();
  let entries = 0;
  let explicitExits = 0;
  let remoteKeyCount = 0;

  for (const event of events) {
    const session = sessions.get(event.sessionId) ?? [];
    session.push(event);
    sessions.set(event.sessionId, session);

    const second = event.occurredAt.slice(0, 19);
    const bucket = timeline.get(second) ?? { entries: 0, exits: 0, remoteKeys: 0 };
    if (event.eventType === "channel_enter") {
      entries += 1;
      bucket.entries += 1;
    }
    if (event.eventType === "channel_exit") {
      explicitExits += 1;
      bucket.exits += 1;
    }
    if (event.eventType === "remote_key") {
      remoteKeyCount += 1;
      bucket.remoteKeys += 1;
      remoteKeys.set(event.remoteKey ?? "UNKNOWN", (remoteKeys.get(event.remoteKey ?? "UNKNOWN") ?? 0) + 1);
    }
    if (event.eventType === "product_view" && event.productId) {
      products.set(event.productId, (products.get(event.productId) ?? 0) + 1);
    }
    timeline.set(second, bucket);
  }

  let activeSessions = 0;
  let interestedSessions = 0;
  const dwellTimes: number[] = [];
  for (const sessionEvents of sessions.values()) {
    const ordered = [...sessionEvents].sort((a, b) => a.sequence - b.sequence);
    const enter = ordered.find((event) => event.eventType === "channel_enter");
    const exit = ordered.find((event) => event.eventType === "channel_exit");
    const hasInterest = ordered.some((event) => event.eventType === "product_view");
    if (hasInterest) interestedSessions += 1;
    if (enter && exit) dwellTimes.push((Date.parse(exit.occurredAt) - Date.parse(enter.occurredAt)) / 1000);
    if (enter && !exit) {
      const latest = ordered.reduce((latestEvent, event) => Date.parse(event.occurredAt) > Date.parse(latestEvent.occurredAt) ? event : latestEvent);
      if (now.getTime() - Date.parse(latest.occurredAt) <= 45_000) activeSessions += 1;
    }
  }

  const receivedInLastSecond = events.filter((event) => event.receivedAt && now.getTime() - event.receivedAt.getTime() <= 1_000).length;
  return {
    asOf: now.toISOString(),
    demoRunId,
    metrics: {
      entries,
      explicitExits,
      activeSessions,
      remoteKeys: remoteKeyCount,
      interestedSessions,
      productReachRate: entries === 0 ? null : interestedSessions / entries,
      averageDwellSeconds: dwellTimes.length === 0 ? null : dwellTimes.reduce((sum, value) => sum + value, 0) / dwellTimes.length,
      ingestionRate: receivedInLastSecond,
    },
    timeline: [...timeline.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([second, values]) => ({ second, ...values })),
    remoteKeys: [...remoteKeys.entries()].sort(([, left], [, right]) => right - left).map(([key, count]) => ({ key, count })),
    products: [...products.entries()].sort(([, left], [, right]) => right - left).map(([productId, count]) => ({ productId, count })),
  };
}
