import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { Page } from "playwright";

export const FIREFOX_UA =
  "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0";

interface FirefoxCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "None" | "Lax" | "Strict" | undefined;
}

/**
 * Read cookies for the given domain(s) from Firefox's cookies.sqlite.
 * Pass a single domain string or an array (e.g. ["x.com", "twitter.com"]).
 */
export function getFirefoxCookies(domains: string | string[]): FirefoxCookie[] {
  const FIREFOX_PROFILE_PATH = process.env.FIREFOX_PROFILE_PATH || "";
  if (!FIREFOX_PROFILE_PATH) {
  console.warn("FIREFOX_PROFILE_PATH not set, proceeding without cookies");
    return [];
  }

  const dbPath = `${FIREFOX_PROFILE_PATH}/cookies.sqlite`;
  if (!existsSync(dbPath)) {
    console.warn(
      `Firefox cookies file not found at ${dbPath}, proceeding without cookies`,
    );
    return [];
  }

  // Copy to temp file to avoid SQLITE_BUSY when Firefox is open
  const tempPath = join(tmpdir(), `firefox-cookies-${process.pid}.sqlite`);
  Bun.spawnSync(["cp", dbPath, tempPath]);
  const db = new Database(tempPath, { readonly: true });

  const domainList = Array.isArray(domains) ? domains : [domains];
  if (domainList.length === 0) return [];
  const conditions = domainList.map(() => `host LIKE ?`).join(" OR ");
  const params = domainList.map((d) => `%${d}`);

  const rows = db
    .query(
      `SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite
       FROM moz_cookies
       WHERE ${conditions}`,
    )
    .all(...params) as Array<{
    name: string;
    value: string;
    host: string;
    path: string;
    expiry: number;
    isSecure: number;
    isHttpOnly: number;
    sameSite: number;
  }>;

  db.close();
  try {
    Bun.spawnSync(["rm", tempPath]);
  } catch {
    // Temp file might not exist
  }

  return rows.map((row) => {
    // Firefox sameSite values: 0=unset, 1=Lax, 2=Strict, 3=None
    let sameSite: "None" | "Lax" | "Strict" | undefined;
    if (row.sameSite === 1) sameSite = "Lax";
    else if (row.sameSite === 2) sameSite = "Strict";
    else if (row.sameSite === 3) sameSite = "None";
    // 0 (unset) → leave undefined
    // SameSite=None requires Secure; downgrade if not
    if (sameSite === "None" && row.isSecure !== 1) sameSite = "Lax";

    let expiry = row.expiry;
    if (expiry > 1e12) {
      expiry = Math.floor(expiry / 1000);
    }

    return {
      name: row.name,
      value: row.value,
      domain: row.host,
      path: row.path,
      expires: expiry,
      secure: row.isSecure === 1,
      httpOnly: row.isHttpOnly === 1,
      sameSite,
    } as FirefoxCookie;
  });
}

/**
 * Apply standard Firefox-matching page setup: viewport, UA, headers,
 * webdriver removal, and Firefox cookie injection for the given domain(s).
 * Call this before page.goto().
 */
export async function setupPage(
  page: Page,
  cookieDomains: string | string[],
): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const cookies = getFirefoxCookies(cookieDomains);
  if (cookies.length > 0) {
    await page.context().addCookies(cookies);
  }
}
