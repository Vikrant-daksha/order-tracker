/**
 * Vercel Serverless Entry Point
 *
 * Vercel looks for a handler exported from /api/index.ts (or /api/*.ts).
 * We just re-export our Express app — Vercel wraps it automatically via
 * the Node.js runtime adapter.
 */
import app from "../src/app";

export default app;

