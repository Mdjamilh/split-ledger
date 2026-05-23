// Long-running Node server: local development, Docker and the e2e tests.
import { boot } from "./boot";

const app = await boot({
  ...(process.env.MIGRATIONS_DIR ? { migrationsFolder: process.env.MIGRATIONS_DIR } : {}),
  webRoot: process.env.WEB_ROOT,
});

const port = Number(process.env.PORT ?? 47311);
await app.listen({ port, host: process.env.HOST ?? "127.0.0.1" });
console.log(`Split Ledger API listening on http://localhost:${port}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}
