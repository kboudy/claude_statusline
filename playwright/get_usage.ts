#!/usr/bin/env bun

// since anthropic doesn't want us using the API to get token, we'll scrape the usage page

import { firefox, type Browser, type Page } from "playwright";
import { setupPage, getFirefoxCookies } from "./cookies";
import fs from "fs";
import * as chrono from "chrono-node";

const USAGE_CACHE_FILEPATH = "/tmp/claude_usage_cache.json";

const launchBrowser = async (): Promise<Browser> => {
  return firefox.launch({
    headless: true,
  });
};

const preparePage = async (browser: Browser) => {
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  const claudeUrl = "https://www.claude.ai";
  const hostname = new URL(claudeUrl).hostname;
  const cookieDomain = hostname.split(".").slice(-2).join(".");

  // Browser config (UA, viewport, webdriver override) — no cookies yet
  await setupPage(page, []);

  // Navigate to claude.ai first so we have a URL context for cookie injection
  await page.goto(claudeUrl, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  // Now set cookies against the established URL context
  const cookies = getFirefoxCookies(cookieDomain);
  if (cookies.length > 0) {
    await context.addCookies(cookies);
  }

  return page;
};

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

interface UsageData {
  fiveHour: {
    usedPercent: number;
    elapsedPercent: number;
  };
  sevenDay: {
    usedPercent: number;
    elapsedPercent: number;
  };
}

export const getCachedUsage: () => Promise<UsageData | null> = async () => {
  // note that we always pull the "cached" usage json file, because we don't want a delay
  // here (it messes with claude terminal ui).  that's done on a cron job
  // if USAGE_CACHE_FILEPATH exists and is less than 5 minutes old, return the cached data
  if (fs.existsSync(USAGE_CACHE_FILEPATH)) {
    const stats = fs.statSync(USAGE_CACHE_FILEPATH);
    const ageMs = Date.now() - stats.mtime.getTime();
    if (ageMs < 5 * 60 * 1000) {
      const cachedData = JSON.parse(
        fs.readFileSync(USAGE_CACHE_FILEPATH, "utf-8"),
      ) as UsageData;
      return cachedData;
    }
  }

  return null;
};

export const setCachedUsage = async (): Promise<void> => {
  const browser = await launchBrowser();
  const page: Page = await preparePage(browser);

  const usageUrl = "https://claude.ai/settings/usage";
  await page.goto(usageUrl, {
    waitUntil: "domcontentloaded",
    timeout: 15000,
  });

  let timeout = 10000;
  let pTexts: string[] = [];
  while (
    timeout > 0 &&
    pTexts.filter((text) => text.includes("% used")).length < 2
  ) {
    await sleep(500);
    timeout -= 500;
    pTexts = await page.evaluate(() => {
      const paragraphs = document.querySelectorAll("p");
      const texts = Array.from(paragraphs).map((p) => p.textContent);
      return texts;
    });
  }
  await browser.close();
  if (timeout <= 0) {
    return;
  }

  /*

example of what pTexts looks like.  we'll assume the first "% used" is 5 hour, and second is "1 week"

[
  "Current session", "Resets in 35 min", "0% used",
  "Learn more about usage limits", "All models", "Resets Fri 9:00 AM",
  "0% used", "Last updated: just now", "Turn on extra usage to keep using Claude if you hit a limit. Learn more",
  "", "$0.00 spent", "Resets Apr 1", "0% used", "$50", "$50", "Monthly spend limit",
  "$47.77", "Current balance·Auto-reload off"
]
*/

  let fiveHourUsageString: string | undefined;
  let fiveHourResetsString: string | undefined;
  let oneWeekUsageString: string | undefined;
  let oneWeekResetsString: string | undefined;

  for (let index = 0; index < pTexts.length; index++) {
    const text = pTexts[index];
    if (text!.includes("% used")) {
      if (!fiveHourUsageString) {
        fiveHourUsageString = text;
        fiveHourResetsString = pTexts[index - 1];
      } else {
        // it's the one week usage
        oneWeekUsageString = text;
        oneWeekResetsString = pTexts[index - 1];
        break;
      }
    }
  }
  if (fiveHourResetsString!.startsWith("Resets in")) {
    fiveHourResetsString = fiveHourResetsString!.replace("Resets ", "");
  }
  if (oneWeekResetsString!.startsWith("Resets in")) {
    oneWeekResetsString = oneWeekResetsString!.replace("Resets ", "");
  }

  // if either hasn't started yet, we'll just set them to the end of the window
  if (fiveHourResetsString?.toLowerCase().includes("starts when")) {
    fiveHourResetsString = "in 5 hours";
  }
  if (oneWeekResetsString?.toLowerCase().includes("starts when")) {
    oneWeekResetsString = "in 1 week";
  }

  const fiveHourUsedPercent = parseFloat(fiveHourUsageString!.split("%")[0]!);
  const oneWeekUsedPercent = parseFloat(oneWeekUsageString!.split("%")[0]!);

  let fiveHourResetsIn = chrono.parse(fiveHourResetsString!)[0]?.start.date()!;
  let oneWeekResetsIn = chrono.parse(oneWeekResetsString!)[0]?.start.date()!;
  if (oneWeekResetsIn < new Date()) {
    // it's possible it incorrectly interprets "Friday" (for instance) as "today Friday"
    // instead of "next Friday".
    // the date should always be in the future, so we use that as a signal to add 7 days
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    oneWeekResetsIn = new Date(oneWeekResetsIn.getTime() + SEVEN_DAYS_MS);
  }

  const fiveHourTimeRemaining =
    fiveHourResetsIn.getTime() - new Date().getTime();
  const fiveHours = 5 * 60 * 60 * 1000;
  const fiveHourElapsedPercent =
    (100 * (fiveHours - fiveHourTimeRemaining)) / fiveHours;

  const oneWeekTimeRemaining = oneWeekResetsIn.getTime() - new Date().getTime();

  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const oneWeekElapsedPercent =
    (100 * (oneWeek - oneWeekTimeRemaining)) / oneWeek;

  const usage = {
    fiveHour: {
      usedPercent: fiveHourUsedPercent,
      elapsedPercent: Math.round(fiveHourElapsedPercent),
    },
    sevenDay: {
      usedPercent: oneWeekUsedPercent,
      elapsedPercent: Math.round(oneWeekElapsedPercent),
    },
  };
  fs.writeFileSync(
    USAGE_CACHE_FILEPATH,
    JSON.stringify(usage, null, 2),
    "utf-8",
  );
};
