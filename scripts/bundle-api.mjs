// Bundles an API entry point into one ESM file with esbuild, and copies the
// files it loads at runtime next to it: the SQL migrations and PGlite's
// WebAssembly build (PGlite finds them relative to the bundle's own URL).
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function bundleApi({ entry, outfile }) {
  const outdir = dirname(outfile);
  await mkdir(outdir, { recursive: true });
  await build({
    entryPoints: [join(root, entry)],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: false,
    legalComments: "none",
    // Some dependencies still call require(); give the ESM bundle one.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: "warning",
  });
  await cp(join(root, "apps/api/drizzle"), join(outdir, "drizzle"), { recursive: true });
  for (const file of ["pglite.wasm", "pglite.data"]) {
    await cp(join(root, "node_modules/@electric-sql/pglite/dist", file), join(outdir, file));
  }
}
