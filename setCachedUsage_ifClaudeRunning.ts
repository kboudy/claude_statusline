#!/usr/bin/env bun

import path from "path";
import { fileURLToPath } from "url";

// Explicitly load .env from project directory (bun:dotenv loads from CWD by default)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
await import("dotenv").then((dotenv) =>
  dotenv.config({ path: path.join(__dirname, ".env") }),
);

import { setCachedUsage } from "./playwright/get_usage";

// determine if claude process is running
const isClaudeRunning = () => {
  const processes = Bun.spawnSync(["ps", "aux"]).stdout.toString();
  return processes.includes("claude");
};

const thisScriptRunningCount = () => {
  const processes = Bun.spawnSync(["ps", "aux"]).stdout.toString();
  const count = processes
    .split("\n")
    .filter((line) => line.includes("setCachedUsage_ifClaudeRunning")).length;
  return count;
};

if (thisScriptRunningCount() > 1) {
  console.log("Another instance of this script is already running. Exiting.");
}

if (isClaudeRunning()) {
  await setCachedUsage();
}
