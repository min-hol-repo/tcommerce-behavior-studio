import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { MongoServerError, type Db } from "mongodb";
import { z } from "zod";
import { aggregateEvents } from "../shared/analytics.ts";
import { demoEventSchema, scenarioSchema, type DemoEvent, type DemoRun, type StoredEvent } from "../shared/contracts.ts";
import { eventsCollection, getDatabase, runsCollection } from "./db.ts";

const eventListQuery = z.object({
  demoRunId: z.string().uuid(),
  source: z.enum(["manual", "synthetic"]).optional(),
  eventType: z.string().optional(),
  sessionId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});

const createRunSchema = z.object({
  broadcastId: z.string().min(1).max(120).default("tcommerce-live-001"),
  scenario: scenarioSchema.default("balanced"),
  targetRate: z.number().int().min(1).max(50).default(15),
});

const patchRunSchema = z.object({
  status: z.enum(["running", "stopped"]).optional(),
  scenario: scenarioSchema.optional(),
  targetRate: z.number().int().min(1).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

const sessionParams = z.object({ sessionId: z.string().uuid() });
const sessionQuery = z.object({ demoRunId: z.string().uuid() });

const broadcast = {
  id: "tcommerce-live-001",
  channelId: "T-COMMERCE",
  title: "Everyday Cookware Live",
  host: "T-Commerce Demo Host",
  product: {
    id: "pan-set-01",
    name: "Stainless Frying Pan Set",
    price: "KRW 89,000",
    detail: "Synthetic product metadata for the public demo",
  },
};

type BatchResult = { eventId: string; status: "stored" | "duplicate" | "invalid" | "conflict" | "retryable"; message?: string };

function retentionDate(): Date {
  const days = Number.parseInt(process.env.EVENT_RETENTION_DAYS ?? "7", 10);
  return new Date(Date.now() + (Number.isFinite(days) && days > 0 ? days : 7) * 86_400_000);
}

function eventPayload(event: StoredEvent | DemoEvent): Record<string, unknown> {
  const { _id, receivedAt, expiresAt, ...payload } = event as StoredEvent;
  return payload;
}

function equalPayload(left: StoredEvent, right: DemoEvent): boolean {
  return JSON.stringify(eventPayload(left)) === JSON.stringify(right);
}

export async function buildApp(db?: Db): Promise<FastifyInstance> {
  const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
  await app.register(cors, { origin: process.env.NODE_ENV === "production" ? false : "http://localhost:5173" });
  const database = db ?? getDatabase();
  const events = eventsCollection(database);
  const runs = runsCollection(database);

  app.get("/api/health", async () => {
    await database.command({ ping: 1 });
    return { status: "ok", database: database.databaseName, asOf: new Date().toISOString() };
  });

  app.get("/api/broadcasts/:id", async (request, reply) => {
    const id = (request.params as { id: string }).id;
    if (id !== broadcast.id) return reply.code(404).send({ error: "Broadcast not found" });
    return broadcast;
  });

  app.post("/api/demo-runs", async (request, reply) => {
    const parsed = createRunSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid demo run", details: parsed.error.flatten() });
    const now = new Date();
    const run: DemoRun = {
      _id: crypto.randomUUID(),
      broadcastId: parsed.data.broadcastId,
      createdAt: now,
      expiresAt: retentionDate(),
      status: "running",
      scenario: parsed.data.scenario,
      targetRate: parsed.data.targetRate,
    };
    await runs.insertOne(run);
    return reply.code(201).send(run);
  });

  app.get("/api/demo-runs", async () => runs.find({}).sort({ createdAt: -1 }).limit(20).toArray());

  app.patch("/api/demo-runs/:id", async (request, reply) => {
    const body = patchRunSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid update", details: body.error.flatten() });
    const result = await runs.findOneAndUpdate(
      { _id: (request.params as { id: string }).id },
      { $set: body.data },
      { returnDocument: "after" },
    );
    if (!result) return reply.code(404).send({ error: "Demo run not found" });
    return result;
  });

  app.post("/api/events/batch", async (request, reply) => {
    const body = request.body as { events?: unknown[] } | undefined;
    if (!body || !Array.isArray(body.events) || body.events.length === 0 || body.events.length > 100) {
      return reply.code(400).send({ error: "events must be an array with 1 to 100 entries" });
    }
    const parsedEvents = body.events.map((event) => demoEventSchema.safeParse(event));
    const validEvents = parsedEvents.flatMap((result) => result.success ? [result.data] : []);
    const runIds = [...new Set(validEvents.map((event) => event.demoRunId))];
    const knownRunIds = new Set((await runs.find({ _id: { $in: runIds }, status: "running", expiresAt: { $gt: new Date() } }, { projection: { _id: 1 } }).toArray()).map((run) => run._id));
    const results: BatchResult[] = [];

    for (const [index, parsed] of parsedEvents.entries()) {
      const raw = body.events[index] as { eventId?: unknown };
      if (!parsed.success) {
        results.push({ eventId: typeof raw?.eventId === "string" ? raw.eventId : `invalid-${index}`, status: "invalid", message: parsed.error.issues[0]?.message });
        continue;
      }
      const event = parsed.data;
      if (!knownRunIds.has(event.demoRunId)) {
        results.push({ eventId: event.eventId, status: "invalid", message: "Demo run is missing, stopped, or expired" });
        continue;
      }
      const now = new Date();
      const document: StoredEvent = { ...event, _id: event.eventId, receivedAt: now, expiresAt: retentionDate() };
      try {
        await events.insertOne(document, { writeConcern: { w: "majority" } });
        results.push({ eventId: event.eventId, status: "stored" });
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 11000) {
          const existing = await events.findOne({ _id: event.eventId }, { readConcern: { level: "majority" } });
          results.push({
            eventId: event.eventId,
            status: existing && equalPayload(existing, event) ? "duplicate" : "conflict",
            message: existing && equalPayload(existing, event) ? undefined : "eventId already exists with a different payload",
          });
        } else {
          app.log.error({ err: error, eventId: event.eventId }, "event storage could not be confirmed");
          results.push({ eventId: event.eventId, status: "retryable", message: "Storage result could not be confirmed" });
        }
      }
    }
    return { results };
  });

  app.get("/api/analytics/summary", async (request, reply) => {
    const parsed = z.object({ demoRunId: z.string().uuid(), source: z.enum(["manual", "synthetic"]).optional() }).safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid analytics query" });
    const filter = { demoRunId: parsed.data.demoRunId, ...(parsed.data.source ? { source: parsed.data.source } : {}) };
    const documents = await events.find(filter).toArray();
    return aggregateEvents(documents, parsed.data.demoRunId);
  });

  app.get("/api/events", async (request, reply) => {
    const parsed = eventListQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid event query", details: parsed.error.flatten() });
    const { limit, before, ...filterInput } = parsed.data;
    const filter: Record<string, unknown> = { ...filterInput };
    if (before) filter.occurredAt = { $lt: before };
    const documents = await events.find(filter).sort({ occurredAt: -1, _id: -1 }).limit(limit).toArray();
    return { events: documents, nextBefore: documents.at(-1)?.occurredAt ?? null };
  });

  app.get("/api/sessions/:sessionId/events", async (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    const query = sessionQuery.safeParse(request.query);
    if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid session query" });
    const documents = await events.find({ demoRunId: query.data.demoRunId, sessionId: params.data.sessionId }).sort({ sequence: 1 }).toArray();
    return { events: documents };
  });

  return app;
}
