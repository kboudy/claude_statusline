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

const main = async () => {
  const input = parseInput();
  const data: UsageData = await fetchUsage(getToken());

  const fiveHourMs = 5 * 60 * 60 * 1000;
  const sevenDayMs = 7 * 24 * 60 * 60 * 1000;

  const fiveHourPct = calcElapsedPct(data.five_hour.resets_at, fiveHourMs);
  const sevenDayPct = calcElapsedPct(data.seven_day.resets_at, sevenDayMs);

  const model = input.model.display_name;
  const dir = path.basename(input.workspace.current_dir);
  const contextPct = input.context_window.used_percentage || 0;
  const isMinimax = model.toLowerCase().includes("minimax");

  console.log(`${colors.cyan}[${model}] 📁 ${dir}${colors.reset}`);
  const claudeOnly =
    `${colors.green}5h ${Math.round(data.five_hour.utilization)}% / ${Math.round(fiveHourPct)}%${colors.reset}  ` +
    `${colors.yellow}7d ${Math.round(data.seven_day.utilization)}% / ${Math.round(sevenDayPct)}%${colors.reset}  `;
  console.log(
    `${isMinimax ? "" : claudeOnly}${colors.magenta}context ${Math.round(contextPct)}% ${colors.reset}`,
  );
};

main();
