#!/usr/bin/env bun

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Explicitly load .env from project directory (bun:dotenv loads from CWD by default)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
await import("dotenv").then((dotenv) =>
  dotenv.config({ quiet: true, path: path.join(__dirname, ".env") }),
);

import {
  setClaudeCachedUsage,
  setOllamaCachedUsage,
} from "./playwright/get_usage";

const removeOldFirefoxCookies = () => {
  // cleanup: firefox cookies older than 5 mins
  try {
    const files = fs
      .readdirSync(tmpdir())
      .filter((f) => f.startsWith("firefox-cookies-"));
    const now = Date.now();
    for (const file of files) {
      const filePath = join(tmpdir(), file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 5 * 60 * 1000) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // Ignore errors
  }
};

const isClaudeRunning = () => {
  const claudeProcessLines = Bun.spawnSync(["pgrep", "-a", "claude"])
    .stdout.toString()
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.includes("cloud"));

  return claudeProcessLines.length > 0;
};

const isOllamaClaudeRunning = () => {
  const claudeProcessLines = Bun.spawnSync(["pgrep", "-a", "claude"])
    .stdout.toString()
    .split("\n")
    .filter((line) => line.trim() !== "" && line.includes("cloud"));

  return claudeProcessLines.length > 0;
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

removeOldFirefoxCookies();
if (isClaudeRunning()) {
  await setClaudeCachedUsage();
}
if (isOllamaClaudeRunning()) {
  await setOllamaCachedUsage();
}
