// Vercel function entry, bundled by scripts/build-vercel.mjs into a single
// function so every /api request shares one warm instance and its in-memory
// demo database. The static web app is served by Vercel's CDN.
import type { IncomingMessage, ServerResponse } from "node:http";

import { boot } from "./boot";

const app = await boot();
await app.ready();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  app.server.emit("request", req, res);
}
