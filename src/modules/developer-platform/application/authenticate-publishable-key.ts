import { invalidCredentials } from "../../../shared/application/errors.js";

export type AuthenticatedPublishableApiKey = Readonly<{
  id: string;
  projectId: string;
}>;

export interface PublishableApiKeyReader {
  findActivePublishableApiKey(
    secretHash: Buffer,
    now: Date
  ): Promise<AuthenticatedPublishableApiKey | undefined>;
}

export const authenticatePublishableApiKey = async (
  reader: PublishableApiKeyReader,
  secretHash: Buffer,
  now: Date
): Promise<AuthenticatedPublishableApiKey> => {
  const key = await reader.findActivePublishableApiKey(secretHash, now);
  if (!key) throw invalidCredentials();
  return key;
};
