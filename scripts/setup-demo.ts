import { closeDatabase, connectDatabase } from "../src/api/db.ts";

try {
  const db = await connectDatabase();
  console.log(`Demo indexes are ready in ${db.databaseName}.`);
} finally {
  await closeDatabase();
}
