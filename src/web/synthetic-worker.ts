/// <reference lib="webworker" />

import type { DemoEvent, RemoteKey, Scenario } from "../shared/contracts.ts";

type StartMessage = {
  type: "start";
  demoRunId: string;
  scenario: Scenario;
  targetRate: number;
  channelId: string;
  broadcastId: string;
  productId: string;
};
type StopMessage = { type: "stop" };
type IncomingMessage = StartMessage | StopMessage;

type SyntheticSession = {
  sessionId: string;
  viewerId: string;
  sequence: number;
  screenId: "watch" | "catalog" | "product";
};

let timer: ReturnType<typeof setInterval> | undefined;
let settings: StartMessage | undefined;
let sessions: SyntheticSession[] = [];
let lastHeartbeatAt = 0;

function randomId(): string {
  return crypto.randomUUID();
}

function emit(session: SyntheticSession, eventType: DemoEvent["eventType"], extra: Partial<DemoEvent> = {}): void {
  if (!settings) return;
  session.sequence += 1;
  const event: DemoEvent = {
    eventId: randomId(),
    schemaVersion: 1,
    demoRunId: settings.demoRunId,
    anonymousViewerId: session.viewerId,
    sessionId: session.sessionId,
    sequence: session.sequence,
    channelId: settings.channelId,
    broadcastId: settings.broadcastId,
    eventType,
    occurredAt: new Date().toISOString(),
    playbackPositionMs: Date.now() % 1_800_000,
    source: "synthetic",
    ...extra,
  };
  postMessage({ type: "event", event });
}

function enter(): void {
  const session: SyntheticSession = { sessionId: randomId(), viewerId: `synthetic-${Math.floor(Math.random() * 50) + 1}`, sequence: 0, screenId: "watch" };
  sessions.push(session);
  emit(session, "channel_enter");
  emit(session, "screen_view", { screenId: "watch" });
}

function remote(session: SyntheticSession, remoteKey: RemoteKey): void {
  emit(session, "remote_key", { remoteKey, screenId: session.screenId });
}

function step(): void {
  if (!settings) return;
  const now = Date.now();
  if (now - lastHeartbeatAt >= 15_000) {
    for (const session of sessions) emit(session, "heartbeat");
    lastHeartbeatAt = now;
  }
  if (sessions.length < 8 || Math.random() < 0.18) {
    enter();
    return;
  }
  const session = sessions[Math.floor(Math.random() * sessions.length)];
  const earlyExit = settings.scenario === "early_exit" ? 0.45 : settings.scenario === "explore" ? 0.06 : 0.16;
  const explore = settings.scenario === "explore" ? 0.6 : 0.28;

  if (Math.random() < earlyExit) {
    emit(session, "channel_exit", { exitReason: "channel_change" });
    sessions = sessions.filter((candidate) => candidate.sessionId !== session.sessionId);
    return;
  }
  if (session.screenId === "watch" && Math.random() < explore) {
    remote(session, "OK");
    session.screenId = "catalog";
    emit(session, "screen_view", { screenId: "catalog" });
    return;
  }
  if (session.screenId === "catalog" && Math.random() < explore) {
    remote(session, "OK");
    session.screenId = "product";
    emit(session, "screen_view", { screenId: "product" });
    emit(session, "product_view", { productId: settings.productId });
    return;
  }
  if (session.screenId === "product" && Math.random() < 0.45) {
    remote(session, "BACK");
    session.screenId = "catalog";
    emit(session, "screen_view", { screenId: "catalog" });
    return;
  }
  remote(session, Math.random() < 0.5 ? "UP" : "DOWN");
}

self.onmessage = ({ data }: MessageEvent<IncomingMessage>) => {
  if (data.type === "stop") {
    if (timer) clearInterval(timer);
    timer = undefined;
    postMessage({ type: "stopped" });
    return;
  }
  settings = data;
  sessions = [];
  lastHeartbeatAt = Date.now();
  if (timer) clearInterval(timer);
  timer = setInterval(step, Math.max(20, Math.round(1000 / data.targetRate)));
  postMessage({ type: "started" });
};

export {};
