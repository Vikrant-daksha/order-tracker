#!/usr/bin/env tsx
/**
 * orchestrate.ts — Orchestrator runner for the multi-agent build system.
 *
 * Usage:
 *   pnpm tsx .agents/skills/multi-agent-orchestrator/scripts/orchestrate.ts \
 *     --codebase ./artifacts/order-mgr \
 *     --handoffs ./handoffs
 *
 * This script:
 *   1. Validates that each handoff flag file exists before proceeding to the next agent.
 *   2. Prints a dashboard of agent statuses.
 *   3. Exits non-zero if any required flag is missing (fail-fast orchestration gate).
 *
 * The actual agent work is done by AI agents reading SKILL.md and writing the handoff files.
 * This script is the VERIFIER — it does not generate code itself.
 */

import fs from "fs";
import path from "path";

const HANDOFFS_DIR = process.env.HANDOFFS_DIR ?? path.resolve(process.cwd(), "handoffs");

type AgentSpec = {
  id: number;
  name: string;
  requiredInputFlags: string[];
  outputFlag: string | null;
  scopedWritePaths: string[];
};

const AGENT_PIPELINE: AgentSpec[] = [
  {
    id: 1,
    name: "Architect",
    requiredInputFlags: [],
    outputFlag: null, // Architect writes JSON/YAML, not a flag
    scopedWritePaths: ["handoffs/"],
  },
  {
    id: 2,
    name: "Data/Persistence",
    requiredInputFlags: [],
    outputFlag: "db-ready.flag",
    scopedWritePaths: ["lib/db/src/", "handoffs/"],
  },
  {
    id: 3,
    name: "API Server",
    requiredInputFlags: ["db-ready.flag"],
    outputFlag: "api-server-ready.flag",
    scopedWritePaths: ["artifacts/api-server/src/", "handoffs/"],
  },
  {
    id: 4,
    name: "Messaging/Integration",
    requiredInputFlags: [],
    outputFlag: "integration-ready.flag",
    scopedWritePaths: ["artifacts/order-mgr/utils/", "handoffs/"],
  },
  {
    id: 5,
    name: "Mobile App",
    requiredInputFlags: ["api-server-ready.flag", "integration-ready.flag"],
    outputFlag: "mobile-ready.flag",
    scopedWritePaths: ["artifacts/order-mgr/", "handoffs/"],
  },
  {
    id: 6,
    name: "Testing/Verification",
    requiredInputFlags: ["api-server-ready.flag", "mobile-ready.flag"],
    outputFlag: "tests-passed.flag",
    scopedWritePaths: ["tests/", "handoffs/"],
  },
  {
    id: 7,
    name: "Reviewer",
    requiredInputFlags: ["tests-passed.flag"],
    outputFlag: "review-report.md",
    scopedWritePaths: ["handoffs/review-report.md"],
  },
];

function flagPath(flag: string): string {
  return path.join(HANDOFFS_DIR, flag);
}

function checkFlag(flag: string): boolean {
  return fs.existsSync(flagPath(flag));
}

function readFlag(flag: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(flagPath(flag), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function statusEmoji(ok: boolean): string {
  return ok ? "✅" : "⏳";
}

function printDashboard(): void {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║       Multi-Agent Orchestrator — Status Dashboard     ║");
  console.log("╠══════════════════════════════════════════════════════╣");

  let allPassed = true;

  for (const agent of AGENT_PIPELINE) {
    const inputsOk = agent.requiredInputFlags.every(checkFlag);
    const outputOk = agent.outputFlag ? checkFlag(agent.outputFlag) : inputsOk;
    const blocked = !inputsOk;

    if (!outputOk) allPassed = false;

    const label = `Agent ${agent.id}: ${agent.name}`.padEnd(28);
    const state = outputOk ? "DONE   " : blocked ? "BLOCKED" : "PENDING";
    const icon = outputOk ? "✅" : blocked ? "🔴" : "⏳";
    console.log(`║  ${icon} ${label} [${state}]  ║`);

    if (blocked) {
      for (const dep of agent.requiredInputFlags) {
        if (!checkFlag(dep)) {
          console.log(`║      └─ Missing: ${dep}`.padEnd(56) + "║");
        }
      }
    }
  }

  console.log("╠══════════════════════════════════════════════════════╣");
  if (allPassed) {
    console.log("║  🎉 All agents complete. Review handoffs/review-report.md  ║");
  } else {
    console.log("║  🔄 Pipeline in progress. Re-run to check status.   ║");
  }
  console.log("╚══════════════════════════════════════════════════════╝\n");
}

function validateHandoffs(): void {
  if (!fs.existsSync(HANDOFFS_DIR)) {
    console.error(`ERROR: handoffs directory not found at ${HANDOFFS_DIR}`);
    console.error("Run Agent 1 (Architect) first to create handoffs/architecture.json");
    process.exit(1);
  }

  // Check Architect produced its core artifacts
  const architectArtifacts = ["architecture.json", "openapi.yaml", "db-schema.ts"];
  const missingArchitect = architectArtifacts.filter(
    (f) => !fs.existsSync(flagPath(f))
  );
  if (missingArchitect.length > 0) {
    console.warn(`⚠️  Architect has not produced: ${missingArchitect.join(", ")}`);
    console.warn("   Agents 2-7 cannot proceed until Architect completes.");
  }
}

function main(): void {
  validateHandoffs();
  printDashboard();

  // Exit non-zero if final review report is not yet present
  const reviewDone = checkFlag("review-report.md");
  process.exit(reviewDone ? 0 : 1);
}

main();
