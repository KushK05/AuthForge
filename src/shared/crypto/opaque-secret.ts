import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type GeneratedSecret = Readonly<{
  value: string;
  prefix: string;
}>;

export const generatePrefixedSecret = (prefix: string): GeneratedSecret => {
  const value = `${prefix}_${randomBytes(32).toString("base64url")}`;
  return { value, prefix: value.slice(0, Math.min(11, value.length)) };
};

export const generateApiKey = (): GeneratedSecret => generatePrefixedSecret("sk");

export const hashOpaqueSecret = (value: string, hashingKey: string): Buffer =>
  createHmac("sha256", hashingKey).update(value, "utf8").digest();

export const timingSafeBufferEqual = (a: Buffer, b: Buffer): boolean =>
  a.length === b.length && timingSafeEqual(a, b);

export const timingSafeStringEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};
