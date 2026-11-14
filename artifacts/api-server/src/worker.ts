/**
 * Cloudflare Workers Entry Point
 *
 * Cloudflare Workers run on the V8 edge runtime — no Node.js `http.listen`.
 * We use the `@hono/node-server` adapter pattern: convert the incoming
 * Request/Response Web API calls into Node-compatible IncomingMessage /
 * ServerResponse objects, then hand them to Express.
 *
 * The lightweight bridge used here is `@whatwg-node/server` which is
 * already compatible with the Cloudflare Workers runtime and needs no extra deps.
 *
 * Install once:
 *   pnpm add @whatwg-node/server
 */
import { createServerAdapter } from "@whatwg-node/server";
import app from "./src/app";

// Wrap the Express app as a standard Fetch API handler
const handler = createServerAdapter(app);

export default {
  fetch: handler.fetch.bind(handler),
} satisfies ExportedHandler;

