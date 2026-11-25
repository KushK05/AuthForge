import type { AuthEmailSender } from "../../src/modules/users/auth-email-service.js";

export class FakeAuthEmailSender implements AuthEmailSender {
  public readonly verificationTokens: string[] = [];
  public readonly resetTokens: string[] = [];

  public async sendVerification(token: string): Promise<void> {
    this.verificationTokens.push(token);
  }

  public async sendPasswordReset(token: string): Promise<void> {
    this.resetTokens.push(token);
  }
}
