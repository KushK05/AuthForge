import {describe, expect, it, vi} from "vitest";
import type {SendEmailCommand} from "@aws-sdk/client-ses";
import {SesAuthEmailSender} from "../../src/modules/users/auth-email-service.js";
import {loadConfig} from "../../src/platform/config.js";

const config = loadConfig({NODE_ENV: "test", DATABASE_URL: "postgres://test:test@localhost/test", REDIS_URL: "redis://localhost", CREDENTIAL_HASH_KEY: "test-credential-hash-key-at-least-32", AUTH_EMAIL_FROM_EMAIL: "sender@authforge.demo", AUTH_EMAIL_TEST_RECIPIENT: "learner@authforge.demo", CONSOLE_ORIGIN: "https://showcase.example.test"});

describe("SES hosted-auth email delivery", () => {
  it("sends verification and reset links to only the configured test inbox", async () => {
    const commands: SendEmailCommand[] = [];
    const send = vi.fn(async (command: SendEmailCommand) => {commands.push(command); return {};});
    const sender = new SesAuthEmailSender(config, {send} as unknown as ConstructorParameters<typeof SesAuthEmailSender>[1]);
    await sender.sendVerification("verify_" + "a".repeat(43));
    await sender.sendPasswordReset("reset_" + "b".repeat(43));
    expect(send).toHaveBeenCalledTimes(2);
    const messages = commands.map(command => command.input);
    for (const message of messages) {
      expect(message.Destination?.ToAddresses).toEqual(["learner@authforge.demo"]);
      expect(message.Source).toBe("sender@authforge.demo");
    }
    expect(messages[0]?.Message?.Body?.Text?.Data).toContain("#action=verify-email");
    expect(messages[1]?.Message?.Body?.Text?.Data).toContain("#action=reset-password");
  });
});
