import { randomUUID } from "node:crypto";

import type { AppConfig } from "../../platform/config.js";
import type { ApiKeyRecord, ShowcaseStore } from "../../platform/store.js";
import {
  capacityExceeded,
  invalidCredentials,
  invalidRequest
} from "../../shared/application/errors.js";
import {
  generateApiKey,
  hashOpaqueSecret
} from "../../shared/crypto/opaque-secret.js";

export type ApiKeySummary = Readonly<{
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  revoked_at?: string;
}>;

export type CreatedApiKey = Readonly<{
  id: string;
  name: string;
  prefix: string;
  secret: string;
  created_at: string;
}>;

const iso = (value: Date): string => value.toISOString();

export const toApiKeySummary = (record: ApiKeyRecord): ApiKeySummary => ({
  id: record.id,
  name: record.name,
  prefix: record.prefix,
  created_at: iso(record.createdAt),
  ...(record.revokedAt ? { revoked_at: iso(record.revokedAt) } : {})
});

const bearerPattern = /^Bearer (sk_[A-Za-z0-9_-]{16,128})$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ApiKeyService {
  public constructor(
    private readonly config: AppConfig,
    private readonly store: ShowcaseStore
  ) {}

  public async createKey(name: string): Promise<CreatedApiKey> {
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 120) {
      throw invalidRequest("API key name must be between 1 and 120 characters");
    }

    const currentKeys = await this.store.listApiKeys();
    if (currentKeys.length >= this.config.maxApiKeys) {
      throw capacityExceeded();
    }

    const generated = generateApiKey();
    const createdAt = new Date();
    const id = randomUUID();
    const secretDigest = hashOpaqueSecret(generated.value, this.config.credentialHashKey);

    const record: ApiKeyRecord = {
      id,
      name: trimmedName,
      prefix: generated.prefix,
      secretDigest,
      createdAt
    };

    await this.store.createApiKey(record, this.config.maxApiKeys);

    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      secret: generated.value,
      created_at: iso(record.createdAt)
    };
  }

  public async listKeys(): Promise<readonly ApiKeySummary[]> {
    const keys = await this.store.listApiKeys();
    return keys.map(toApiKeySummary);
  }

  public async authenticateKey(authorizationHeader: string | undefined): Promise<ApiKeyRecord> {
    if (typeof authorizationHeader !== "string") {
      throw invalidCredentials("invalid_api_key");
    }

    const match = bearerPattern.exec(authorizationHeader);
    if (!match?.[1]) {
      throw invalidCredentials("invalid_api_key");
    }

    const rawKey = match[1];
    const digest = hashOpaqueSecret(rawKey, this.config.credentialHashKey);
    const key = await this.store.findApiKey(digest, new Date());

    if (!key) {
      throw invalidCredentials("invalid_api_key");
    }

    return key;
  }

  public async revokeKey(keyId: string): Promise<void> {
    if (!uuidPattern.test(keyId)) {
      throw invalidRequest("Invalid API-key identifier");
    }

    await this.store.revokeApiKey(keyId, new Date());
  }
}
