import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  reporter: "list",
  use: {baseURL: "http://127.0.0.1:8081", trace: "off", screenshot: "off", video: "off", ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {launchOptions: {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}} : {})},
  webServer: {
    command: "npm run start:api",
    url: "http://127.0.0.1:8081/health/ready",
    reuseExistingServer: false,
    env: {
      NODE_ENV: "test", HOST: "127.0.0.1", PORT: "8081", LOG_LEVEL: "error",
      DATABASE_URL: process.env.AUTHFORGE_TEST_DATABASE_URL ?? "postgres://authforge:authforge@127.0.0.1:55432/authforge",
      REDIS_URL: process.env.AUTHFORGE_TEST_REDIS_URL ?? "redis://127.0.0.1:56379",
      CONSOLE_ORIGIN: "http://127.0.0.1:8081",
      CREDENTIAL_HASH_KEY: randomUUID() + randomUUID(), SECURE_COOKIES: "false"
    }
  }
});
