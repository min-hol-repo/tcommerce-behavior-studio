import { z } from "zod";

export const eventTypes = [
  "channel_enter",
  "channel_exit",
  "remote_key",
  "screen_view",
  "product_view",
  "purchase_intent",
  "heartbeat",
] as const;

export const eventTypeSchema = z.enum(eventTypes);
export const remoteKeySchema = z.enum(["UP", "DOWN", "LEFT", "RIGHT", "OK", "BACK"]);

const baseEventSchema = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal(1),
  demoRunId: z.string().uuid(),
  anonymousViewerId: z.string().min(1).max(120),
  sessionId: z.string().uuid(),
  sequence: z.number().int().positive(),
  channelId: z.string().min(1).max(80),
  broadcastId: z.string().min(1).max(120),
  productId: z.string().min(1).max(120).optional(),
  eventType: eventTypeSchema,
  occurredAt: z.string().datetime({ offset: true }),
  playbackPositionMs: z.number().int().nonnegative(),
  source: z.enum(["manual", "synthetic"]),
  screenId: z.string().min(1).max(80).optional(),
  remoteKey: remoteKeySchema.optional(),
  exitReason: z.enum(["channel_change", "explicit_exit"]).optional(),
});

export const demoEventSchema = baseEventSchema.superRefine((event, context) => {
  if (event.eventType === "channel_exit" && !event.exitReason) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "channel_exit requires exitReason", path: ["exitReason"] });
  }
  if (event.eventType === "remote_key" && !event.remoteKey) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "remote_key requires remoteKey", path: ["remoteKey"] });
  }
  if (["screen_view", "remote_key"].includes(event.eventType) && !event.screenId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `${event.eventType} requires screenId`, path: ["screenId"] });
  }
  if (["product_view", "purchase_intent"].includes(event.eventType) && !event.productId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `${event.eventType} requires productId`, path: ["productId"] });
  }
});

export const eventBatchSchema = z.object({
  events: z.array(demoEventSchema).min(1).max(100),
});

export type DemoEvent = z.infer<typeof demoEventSchema>;
export type EventType = DemoEvent["eventType"];
export type RemoteKey = z.infer<typeof remoteKeySchema>;

export type StoredEvent = DemoEvent & {
  _id: string;
  receivedAt: Date;
  expiresAt: Date;
};

export const scenarioSchema = z.enum(["balanced", "explore", "early_exit"]);
export type Scenario = z.infer<typeof scenarioSchema>;

export type DemoRun = {
  _id: string;
  broadcastId: string;
  createdAt: Date;
  expiresAt: Date;
  status: "running" | "stopped";
  scenario: Scenario;
  targetRate: number;
};
