import { defineConfig } from "vitest/config";
export default defineConfig({test: {include: ["tests/unit/**/*.test.ts", "tests/contract/**/*.test.ts", "tests/integration/**/*.test.ts"], testTimeout: 15000, hookTimeout: 30000}});
