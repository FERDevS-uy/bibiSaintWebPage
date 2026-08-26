import { defineConfig } from "@playwright/test";

// Use the chromium-1237 we already have in cache. Playwright 1.62.1 ships
// browser registry for 1234, so we point executablePath explicitly to the
// Chrome for Testing binary that exists locally on this machine.
const CHROME_EXEC =
  process.env.PLAYWRIGHT_CHROME_EXEC ??
  "/Users/franccesco.giordano/Library/Caches/ms-playwright/chromium-1237/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:4321",
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 13 logical viewport
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: CHROME_EXEC },
  },
  projects: [
    {
      name: "mobile-390",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
