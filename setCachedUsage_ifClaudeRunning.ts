#!/usr/bin/env bun

import path from "path";
import { fileURLToPath } from "url";

// Explicitly load .env from project directory (bun:dotenv loads from CWD by default)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
await import("dotenv").then((dotenv) =>
  dotenv.config({ quiet: true, path: path.join(__dirname, ".env") }),
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

// I'm not sure why cron is saying there are 2 instances running, but
// to be safe, if there are more than 2 instances of this script running, exit.
if (thisScriptRunningCount() > 2) {
  console.log("Another instance of this script is already running. Exiting.");
  process.exit(0);
}

if (isClaudeRunning()) {
  await setCachedUsage();
}
