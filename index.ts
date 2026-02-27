#!/usr/bin/env bun

import fs from "fs";
import path from "path";

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  black: "\x1b[30m",
};

interface UsagePeriod {
  resets_at: string;
  utilization: number;
}

interface UsageData {
  five_hour: UsagePeriod;
  seven_day: UsagePeriod;
}

const parseInput = () => {
  const json = JSON.parse(process.argv[2] || "");
  if (!json || typeof json !== "object") {
    console.error("Invalid input: Expected a JSON object");
    process.exit(1);
  }
  return json;
};

const getToken = () => {
  const credentials = JSON.parse(
    fs.readFileSync(`/home/keith/.claude/.credentials.json`, "utf-8"),
  );
  return credentials.claudeAiOauth.accessToken;
};

const fetchUsage = async (token: string): Promise<UsageData> => {
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      "User-Agent": "claude-code/2.0.31",
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    },
  });
  return res.json() as Promise<UsageData>;
};

const calcElapsedPct = (resetsAt: string, windowMs: number) => {
  const resets = new Date(resetsAt).getTime();
  return ((Date.now() - (resets - windowMs)) / windowMs) * 100;
};

const barGraph = (pct: number, length = 20) => {
  const filledLength = Math.round((pct / 100) * length);
  const emptyLength = length - filledLength;
  return `${twoCharNum(Math.round(pct))}% ${"█".repeat(filledLength)}${"░".repeat(emptyLength)}`;
};

const twoCharNum = (num: number) => {
  if (num < 10) {
    return ` ${num}`;
  }
  return num;
};

const main = async () => {
  const input = parseInput();
  const data: UsageData = await fetchUsage(getToken());

  const fiveHourMs = 5 * 60 * 60 * 1000;
  const sevenDayMs = 7 * 24 * 60 * 60 * 1000;

  const fiveHourElapsedPct = Math.round(
    calcElapsedPct(data.five_hour.resets_at, fiveHourMs),
  );
  const sevenDayElapsedPct = Math.round(
    calcElapsedPct(data.seven_day.resets_at, sevenDayMs),
  );

  const model = input.model.display_name;
  const dir = path.basename(input.workspace.current_dir);
  const contextPct = input.context_window.used_percentage || 0;
  const isMinimax = model.toLowerCase().includes("minimax");

  const utilPercent5H = Math.round(data.five_hour.utilization);
  const utilPercent7D = Math.round(data.seven_day.utilization);

  const contextPercent = `${colors.magenta}context ${Math.round(contextPct)}% ${colors.reset}`;
  console.log(
    `${colors.cyan}[${model}] 📁 ${dir}${colors.reset}   ${contextPercent}`,
  );
  const utilization_5H_upper = `${colors.green}5H ${barGraph(utilPercent5H)}${colors.reset}`;
  // the "colors.green+reset" is necessary to prevent leading spaces from getting eaten by the terminal's trimming
  const utilization_5H_lower = `${colors.green} ${colors.reset}${colors.green}  ${barGraph(fiveHourElapsedPct)}${colors.reset}`;

  const utilization_7D_upper = `${colors.yellow}   7D ${barGraph(utilPercent7D)}${colors.reset}`;
  const utilization_7D_lower = `${colors.yellow}      ${barGraph(sevenDayElapsedPct)}${colors.reset}`;

  const textForClaudeOnly =
    `${utilization_5H_upper} ${utilization_7D_upper}\n` +
    `${utilization_5H_lower} ${utilization_7D_lower}\n`;
  console.log(`${isMinimax ? "" : textForClaudeOnly}`);
};

main();
