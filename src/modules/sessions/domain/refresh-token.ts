import { randomBytes } from "node:crypto";

import { hashOpaqueSecret } from "../../../shared/crypto/opaque-secret.js";

export const generateRefreshToken = (): string => `rt_${randomBytes(32).toString("base64url")}`;

export const hashRefreshToken = (token: string, hashingKey: string): Buffer =>
  hashOpaqueSecret(token, hashingKey);
