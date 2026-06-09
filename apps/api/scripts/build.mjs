// Production build of the long-running server (used by the Docker image):
// dist/server.mjs plus its migrations and PGlite files.
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { bundleApi } from "../../../scripts/bundle-api.mjs";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
await rm(dist, { recursive: true, force: true });
await bundleApi({ entry: "apps/api/src/server.ts", outfile: `${dist}/server.mjs` });
console.log("Built apps/api/dist/server.mjs");
