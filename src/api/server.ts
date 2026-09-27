import { buildApp } from "./app.ts";
import { closeDatabase, connectDatabase } from "./db.ts";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.API_PORT ?? "3001", 10);

try {
  await connectDatabase();
  const app = await buildApp();
  const close = async () => {
    await app.close();
    await closeDatabase();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  await app.listen({ host, port });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
