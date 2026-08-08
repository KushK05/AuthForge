import { forbidden, invalidCredentials } from "../../../shared/application/errors.js";

export type AuthenticatedSecretApiKey = Readonly<{
  id: string;
  projectId: string;
  scopes: readonly string[];
}>;

export interface SecretApiKeyReader {
  findActiveSecretApiKey(
    secretHash: Buffer,
    now: Date
  ): Promise<AuthenticatedSecretApiKey | undefined>;
}

export const authenticateSecretApiKey = async (
  reader: SecretApiKeyReader,
  secretHash: Buffer,
  requiredScope: string,
  now: Date
): Promise<AuthenticatedSecretApiKey> => {
  const key = await reader.findActiveSecretApiKey(secretHash, now);
  if (!key) throw invalidCredentials();
  if (!key.scopes.includes(requiredScope)) {
    throw forbidden("API key lacks the required scope");
  }
  return key;
};
