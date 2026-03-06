#!/usr/bin/env bun

import fs from "fs";
import path from "path";
import { getUsage } from "./puppeteer/get_usage";

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

interface ClaudeInput {
  model: {
    display_name: string;
  };
  workspace: {
    current_dir: string;
  };
  context_window: {
    used_percentage?: number;
  };
}

const parseInput = (): ClaudeInput => {
  const json = JSON.parse(process.argv[2] || "");

  if (!json || typeof json !== "object") {
    console.error("Invalid input: Expected a JSON object");
    process.exit(1);
  }
  return json;
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

const outputClaudeUsage = async () => {
  const usage = await getUsage();

  const utilization_5H_upper = `${colors.green}5H ${barGraph(usage.fiveHour.usedPercent)}${colors.reset}`;
  // the "colors.green+reset" is necessary to prevent leading spaces from getting eaten by the terminal's trimming
  const utilization_5H_lower = `${colors.green} ${colors.reset}${colors.green}  ${barGraph(usage.fiveHour.elapsedPercent)}${colors.reset}`;

  const utilization_7D_upper = `${colors.yellow}   7D ${barGraph(usage.sevenDay.usedPercent)}${colors.reset}`;
  const utilization_7D_lower = `${colors.yellow}      ${barGraph(usage.sevenDay.elapsedPercent)}${colors.reset}`;

  console.log(
    `${utilization_5H_upper} ${utilization_7D_upper}\n` +
      `${utilization_5H_lower} ${utilization_7D_lower}\n`,
  );
};

const outputModelAndContext = async (input: ClaudeInput) => {
  const model = input.model.display_name;
  const dir = path.basename(input.workspace.current_dir);
  const contextPct = input.context_window.used_percentage || 0;

  const contextPercent = `${colors.magenta}context ${Math.round(contextPct)}% ${colors.reset}`;
  console.log(
    `${colors.cyan}[${model}] 📁 ${dir}${colors.reset}   ${contextPercent}`,
  );
};

const main = async () => {
  const input = parseInput();
  const model = input.model.display_name;
  const isClaude = !model.toLowerCase().includes("minimax");
  await outputModelAndContext(input);
  if (isClaude) {
    try {
      await outputClaudeUsage();
    } catch (ex) {
      const tempErrorLogPath = "/tmp/claude_usage_error.log";
      fs.appendFileSync(
        tempErrorLogPath,
        `${new Date().toISOString()} - Error fetching usage data: ${ex}\n`,
      );
      console.error("Error fetching usage data:", ex);
    }
  }
};

main();
