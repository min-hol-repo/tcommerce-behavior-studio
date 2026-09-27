import "dotenv/config";
import { MongoClient, type Collection, type Db } from "mongodb";
import type { DemoRun, StoredEvent } from "../shared/contracts.ts";

let client: MongoClient | undefined;
let database: Db | undefined;

export function getDatabase(): Db {
  if (!database) throw new Error("MongoDB is not configured. Set MONGODB_URI before starting the API.");
  return database;
}

export async function connectDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure a dedicated Atlas demo database.");
  client = new MongoClient(uri, { appName: "tcommerce-behavior-demo", retryWrites: true });
  await client.connect();
  database = client.db(process.env.MONGODB_DB ?? "tcommerce_demo");
  await ensureCollections(database);
  return database;
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = undefined;
  database = undefined;
}

export function eventsCollection(db = getDatabase()): Collection<StoredEvent> {
  return db.collection<StoredEvent>("events");
}

export function runsCollection(db = getDatabase()): Collection<DemoRun> {
  return db.collection<DemoRun>("demo_runs");
}

export async function ensureCollections(db: Db): Promise<void> {
  const events = db.collection<StoredEvent>("events");
  const runs = db.collection<DemoRun>("demo_runs");
  await Promise.all([
    events.createIndex({ demoRunId: 1, occurredAt: -1, _id: -1 }),
    events.createIndex({ demoRunId: 1, sessionId: 1, sequence: 1 }),
    events.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    runs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
}
