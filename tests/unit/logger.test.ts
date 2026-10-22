import { describe, expect, it } from "vitest";

import { Logger, redactObject } from "../../src/platform/logger.js";

describe("Logger & Redaction", () => {
  describe("redactObject", () => {
    it("strips sensitive credential keys regardless of casing and punctuation", () => {
      const input = {
        request_id: "req_12345678",
        status: 200,
        authorization: "Bearer sk_sample123456789012345678",
        cookie: "authforge_console=cs_sample123456789012345678",
        "set-cookie": "authforge_console=cs_sample",
        access_code: "super-secret-code",
        ACCESS_CODE: "super-secret-code",
        "access-code": "super-secret-code",
        api_key: "sk_sample",
        apiKey: "sk_sample",
        secret: "sk_sample",
        token: "cs_sample",
        subject: "demo-subject-1",
        csrf_token: "csrf_sample",
        "x-csrf-token": "csrf_sample",
        secret_digest: Buffer.from("123"),
        token_digest: Buffer.from("456"),
        password: "my-password"
      };

      const result = redactObject(input);

      expect(result).toEqual({
        request_id: "req_12345678",
        status: 200
      });
      expect(result).not.toHaveProperty("authorization");
      expect(result).not.toHaveProperty("cookie");
      expect(result).not.toHaveProperty("access_code");
      expect(result).not.toHaveProperty("secret");
      expect(result).not.toHaveProperty("subject");
      expect(result).not.toHaveProperty("password");
    });

    it("recursively redacts nested objects and arrays", () => {
      const input = {
        request_id: "req_123",
        meta: {
          nested_secret: "hidden",
          access_code: "bad",
          safe_field: "good"
        },
        items: [
          { token: "abc", count: 1 },
          { secret: "xyz", count: 2 }
        ]
      };

      const result = redactObject(input);

      expect(result).toEqual({
        request_id: "req_123",
        meta: {
          safe_field: "good"
        },
        items: [
          { count: 1 },
          { count: 2 }
        ]
      });
    });

    it("redacts secret tokens embedded within string values", () => {
      const input = {
        details: "Failed auth using Bearer sk_demo_123456789012345678901234 and session cs_12345678901234567890",
        message: "Generated token csrf_12345678901234567890"
      };

      const result = redactObject(input);

      expect(result.details).not.toContain("sk_demo_123456789012345678901234");
      expect(result.details).not.toContain("cs_12345678901234567890");
      expect(result.message).not.toContain("csrf_12345678901234567890");
      expect(result.details).toContain("[REDACTED]");
    });
  });

  describe("Logger execution", () => {
    it("writes valid structured JSON with timestamp, level, and redacted fields", () => {
      const outputLines: string[] = [];
      const logger = new Logger("info", "test", (line) => outputLines.push(line));

      logger.info("API request completed", {
        request_id: "req_abc",
        status: 201,
        authorization: "Bearer sk_123456789012345678"
      });

      expect(outputLines.length).toBe(1);
      const parsed = JSON.parse(outputLines[0]!) as Record<string, unknown>;

      expect(parsed.level).toBe("info");
      expect(parsed.message).toBe("API request completed");
      expect(parsed.environment).toBe("test");
      expect(parsed.request_id).toBe("req_abc");
      expect(parsed.status).toBe(201);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed).not.toHaveProperty("authorization");
    });

    it("filters out log messages below configured log level", () => {
      const outputLines: string[] = [];
      const logger = new Logger("warn", "test", (line) => outputLines.push(line));

      logger.debug("Debug message");
      logger.info("Info message");
      expect(outputLines.length).toBe(0);

      logger.warn("Warn message");
      expect(outputLines.length).toBe(1);

      logger.error("Error message");
      expect(outputLines.length).toBe(2);
    });
  });
});
