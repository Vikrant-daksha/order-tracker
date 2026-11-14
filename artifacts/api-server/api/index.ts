/**
 * Vercel Serverless Entry Point
 *
 * Vercel's @vercel/node runtime expects a standard Node.js http handler.
 * Exporting the Express app directly works because Express implements
 * the (req, res) => void signature that Vercel wraps.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../src/app";

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Delegate every request to the Express app
  return app(req as any, res as any);
}
