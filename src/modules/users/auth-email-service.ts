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
    const link = this.actionLink("/verify-email", token);
    await this.send("Verify your AuthForge email", `Welcome to AuthForge.\n\nConfirm your email address to finish creating your demo account:\n\n${link}\n\nThis link expires in one hour and works once. If you did not sign up, you can ignore this message.\n\nAuthForge is a temporary demo environment.`);
  }

  private actionLink(path: string, token: string): string {
    const link = new URL(path, this.config.consoleOrigin);
    link.hash = new URLSearchParams({token}).toString();
    return link.toString();
  }

  public async sendPasswordReset(token: string): Promise<void> {
    const link = this.actionLink("/reset-password", token);
    await this.send("Reset your AuthForge password", `We received a request to reset your AuthForge demo password.\n\nChoose a new password here:\n\n${link}\n\nThis link expires in 15 minutes and works once. If you did not request a reset, you can ignore this message.\n\nAuthForge is a temporary demo environment.`);
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
