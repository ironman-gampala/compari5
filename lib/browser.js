import { existsSync } from "fs";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

function resolveChromePath() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function chromeAvailable() {
  return Boolean(resolveChromePath());
}

export async function withBrowserPage(fn, options = {}) {
  const executablePath = resolveChromePath();
  if (!executablePath) {
    throw new Error(
      "Chrome is not installed for guest store search. Re-auth Zepto via /api/auth/zepto, or set CHROME_PATH."
    );
  }

  let puppeteer;
  try {
    puppeteer = await import("puppeteer-core");
  } catch {
    throw new Error(
      "puppeteer-core is missing. Run npm install, or sign in to Zepto via /api/auth/zepto."
    );
  }

  const browser = await puppeteer.default.launch({
    executablePath,
    headless: options.headless ?? "new",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    return await fn(page, browser);
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
