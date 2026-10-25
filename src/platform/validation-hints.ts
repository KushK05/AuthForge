import type { Redis } from "ioredis";

// Identifiers only. Every validation still rechecks PostgreSQL, including key status.
export interface ValidationHints {
  get(apiKeyId: string, digest: Buffer): Promise<string | undefined>;
  remember(apiKeyId: string, digest: Buffer, sessionId: string, expiresAt: Date): Promise<void>;
  forget(apiKeyId: string, digest: Buffer): Promise<void>;
}
export class RedisValidationHints implements ValidationHints {
  public constructor(private readonly redis: Pick<Redis, "get" | "set" | "del">) {}
  private key(apiKeyId: string, digest: Buffer): string {return `validation:${apiKeyId}:${digest.toString("hex")}`;}
  public async get(apiKeyId: string, digest: Buffer): Promise<string | undefined> {
    try {return await this.redis.get(this.key(apiKeyId, digest)) ?? undefined;} catch {return undefined;}
  }
  public async remember(apiKeyId: string, digest: Buffer, sessionId: string, expiresAt: Date): Promise<void> {
    const ttl = Math.min(30, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
    if (ttl <= 0) return;
    try {await this.redis.set(this.key(apiKeyId, digest), sessionId, "EX", ttl);} catch { /* PostgreSQL remains authoritative. */ }
  }
  public async forget(apiKeyId: string, digest: Buffer): Promise<void> {
    try {await this.redis.del(this.key(apiKeyId, digest));} catch { /* Expiry bounds stale hints. */ }
  }
}
export const noValidationHints: ValidationHints = {
  get: async () => undefined, remember: async () => {}, forget: async () => {}
};
