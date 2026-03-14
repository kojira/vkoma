import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    browserName: "chromium",
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
    },
  },
  webServer: {
    command: "npx vite",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
});
