import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

import type { AppConfig } from "../../platform/config.js";
import { unavailableDependency } from "../../shared/application/errors.js";

export interface AuthEmailSender {
  sendVerification(token: string): Promise<void>;
  sendPasswordReset(token: string): Promise<void>;
}

type SesSenderClient = Pick<SESClient, "send">;

export class SesAuthEmailSender implements AuthEmailSender {
  private readonly ses: SesSenderClient;

  public constructor(private readonly config: AppConfig, client?: SesSenderClient) {
    this.ses = client ?? new SESClient({
      region: config.awsRegion,
      ...(config.awsSesEndpointUrl ? { endpoint: config.awsSesEndpointUrl } : {})
    });
  }

  public async sendVerification(token: string): Promise<void> {
    const link = new URL("/", this.config.consoleOrigin);
    link.hash = new URLSearchParams({action: "verify-email", token}).toString();
    await this.send("Verify your AuthForge demo account", `Use this one-time link to verify the AuthForge demo account:\n\n${link.toString()}\n\nThis link expires in one hour. If you did not request it, ignore this message.`);
  }

  public async sendPasswordReset(token: string): Promise<void> {
    const link = new URL("/", this.config.consoleOrigin);
    link.hash = new URLSearchParams({action: "reset-password", token}).toString();
    await this.send("Reset your AuthForge demo password", `Use this one-time link to choose a new AuthForge demo password:\n\n${link.toString()}\n\nThis link expires in 15 minutes. If you did not request it, ignore this message.`);
  }

  private async send(subject: string, text: string): Promise<void> {
    const source = this.config.authEmailFromEmail;
    const recipient = this.config.authEmailTestRecipient;
    if (!source || !recipient) throw unavailableDependency();
    try {
      await this.ses.send(new SendEmailCommand({
        Source: source,
        Destination: {ToAddresses: [recipient]},
        Message: {Subject: {Data: subject}, Body: {Text: {Data: text}}}
      }));
    } catch {
      throw unavailableDependency();
    }
  }
}
