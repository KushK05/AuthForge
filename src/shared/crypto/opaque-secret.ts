import { createHmac, randomBytes } from "node:crypto";

export type ApiKeyKind = "publishable" | "secret";

export type GeneratedApiKey = Readonly<{
  value: string;
  prefix: string;
}>;

export const generateApiKey = (kind: ApiKeyKind): GeneratedApiKey => {
  const marker = kind === "secret" ? "sk" : "pk";
  const value = `${marker}_${randomBytes(32).toString("base64url")}`;

  return { value, prefix: value.slice(0, 11) };
};

export const hashOpaqueSecret = (value: string, hashingKey: string): Buffer =>
  createHmac("sha256", hashingKey).update(value, "utf8").digest();
