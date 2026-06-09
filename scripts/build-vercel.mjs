// Builds the deployment with Vercel's Build Output API (version 3):
// the Vite build as static files, and the whole API as ONE Node function.
// One function means one warm instance serves every /api route, so the
// in-memory demo database stays consistent between requests.
// https://vercel.com/docs/build-output-api/v3
import { execSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";

import { bundleApi } from "./bundle-api.mjs";

const out = ".vercel/output";
const fn = `${out}/functions/api.func`;

await rm(out, { recursive: true, force: true });
execSync("npm run build --workspace @split-ledger/web", { stdio: "inherit" });
await mkdir(`${out}/static`, { recursive: true });
await cp("apps/web/dist", `${out}/static`, { recursive: true });

await bundleApi({ entry: "apps/api/src/vercel.ts", outfile: `${fn}/index.mjs` });
await writeFile(
  `${fn}/.vc-config.json`,
  JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 30 }, null, 2),
);

await writeFile(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/api(/.*)?$", dest: "/api" },
        { src: "^/assets/(.*)$", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { handle: "filesystem" },
        // Every other path is a client-side route of the single-page app.
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log("Wrote", out);
