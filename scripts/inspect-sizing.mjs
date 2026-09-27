import "dotenv/config";
import { MongoClient, BSON } from "mongodb";
import { writeFile } from "node:fs/promises";

// Do not import the app's database module: connecting there creates indexes.
const uri = process.env.MONGODB_URI;
if (!uri || /<username>|<password>|<cluster>/.test(uri)) {
  console.error("Configure MONGODB_URI for the intended demo database first.");
  process.exit(1);
}

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (outputIndex >= 0 && !output) {
  console.error("--output requires a local JSON file path.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  appName: "tcommerce-sizing-read-only",
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 15_000,
  maxPoolSize: 2,
});

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "tcommerce_demo");
  const report = {
    capturedAt: new Date().toISOString(),
    database: db.databaseName,
    units: "bytes; decimal KB=1000 bytes",
    readOnlyDatabaseOperations: true,
    collections: [],
    warnings: [],
  };

  for (const name of ["events", "demo_runs"]) {
    const collection = db.collection(name);
    const stats = await collection.aggregate([
      { $collStats: { storageStats: { scale: 1 } } },
      { $project: {
        _id: 0,
        "storageStats.count": 1,
        "storageStats.size": 1,
        "storageStats.storageSize": 1,
        "storageStats.freeStorageSize": 1,
        "storageStats.totalIndexSize": 1,
        "storageStats.indexSizes": 1,
      } },
    ], { maxTimeMS: 10_000 }).toArray();
    const indexes = await collection.listIndexes().toArray();
    const sum = (field) => stats.reduce((total, item) => total + Number(item.storageStats?.[field] ?? 0), 0);
    const count = sum("count");
    const size = sum("size");
    const storageSize = sum("storageSize");
    const indexSizes = {};
    for (const item of stats) {
      for (const [key, value] of Object.entries(item.storageStats?.indexSizes ?? {})) {
        indexSizes[key] = (indexSizes[key] ?? 0) + Number(value);
      }
    }
    report.collections.push({
      name,
      statisticsPartitions: stats.length,
      documentCount: count,
      logicalDataBytes: size,
      averageDocumentBytes: count ? size / count : null,
      allocatedDataBytes: storageSize,
      freeDataBytes: sum("freeStorageSize"),
      allocatedIndexBytes: sum("totalIndexSize"),
      effectiveLogicalToAllocatedDataRatio: storageSize ? size / storageSize : null,
      indexes: indexes.map((index) => ({
        name: index.name,
        key: index.key,
        unique: index.name === "_id_" || Boolean(index.unique),
        expireAfterSeconds: index.expireAfterSeconds ?? null,
        allocatedBytes: indexSizes[index.name] ?? null,
        allocatedBytesPerDocument: count && indexSizes[index.name] !== undefined
          ? indexSizes[index.name] / count : null,
      })),
    });
  }

  // Only counts are returned. No event payloads or viewer identifiers are exported.
  const newest = await db.collection("demo_runs").find({}, {
    projection: { _id: 1, createdAt: 1 },
    maxTimeMS: 10_000,
  }).sort({ createdAt: -1 }).limit(1).next();
  if (newest) {
    const latestCount = await db.collection("events").countDocuments({ demoRunId: newest._id }, { maxTimeMS: 10_000 });
    const total = report.collections.find((item) => item.name === "events").documentCount;
    report.latestRun = {
      createdAt: newest.createdAt,
      eventCount: latestCount,
      percentOfAllEvents: total ? latestCount / total * 100 : null,
      note: "Newest run is not proof of which run a browser is viewing; this is not a measured cache working set.",
    };
  }

  report.sampleDemoRunBsonBytes = BSON.calculateObjectSize({
    _id: "11111111-1111-4111-8111-111111111111",
    broadcastId: "tcommerce-live-001",
    createdAt: new Date(),
    expiresAt: new Date(),
    status: "running",
    scenario: "balanced",
    targetRate: 15,
  });
  report.warnings.push(
    "Point-in-time storage statistics are not a throughput benchmark.",
    "size/storageSize is an effective allocated-space ratio, not a pure compression-codec ratio.",
    "Index bytes per document include prefix compression, allocation and free space; they are not raw key entry sizes.",
    "Statistics are collected sequentially and may differ if concurrent writes occur.",
  );
  const json = JSON.stringify(report, null, 2);
  if (output) await writeFile(output, `${json}\n`, "utf8");
  console.log(json);
} catch (error) {
  // Error messages can contain connection details; report only safe metadata.
  console.error(JSON.stringify({
    error: "Read-only sizing inspection failed",
    type: error?.name ?? "UnknownError",
    code: error?.code ?? null,
    advice: "Check the intended URI, network access and collection-statistics permissions. No DB writes were attempted.",
  }));
  process.exitCode = 1;
} finally {
  await client.close();
}
