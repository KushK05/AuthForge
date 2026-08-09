import { createHmac, timingSafeEqual } from "node:crypto";

export const deriveEmailToken = (tokenId: string, derivationKey: string): string =>
  `v1.${tokenId}.${createHmac("sha256", derivationKey).update(tokenId).digest("base64url")}`;

export const hashEmailToken = (token: string, derivationKey: string): Buffer =>
  createHmac("sha256", derivationKey).update(token).digest();

export const matchesEmailToken = (tokenId: string, token: string, derivationKey: string): boolean => {
  const expected = Buffer.from(deriveEmailToken(tokenId, derivationKey));
  const provided = Buffer.from(token);
  return expected.byteLength === provided.byteLength && timingSafeEqual(expected, provided);
};
