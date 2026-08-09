import * as argon2 from "argon2";

import { invalidRequest } from "../../../shared/application/errors.js";

export type Argon2Parameters = Readonly<{
  memoryKiB: number;
  iterations: number;
  parallelism: number;
}>;

export const validatePassword = (password: string, minimumLength: number): void => {
  if (password.length < minimumLength || password.length > 1_024) {
    throw invalidRequest(`Password must contain between ${minimumLength} and 1024 characters`);
  }
};

export const hashPassword = (password: string, parameters: Argon2Parameters): Promise<string> =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: parameters.memoryKiB,
    timeCost: parameters.iterations,
    parallelism: parameters.parallelism
  });

export const verifyPassword = (passwordHash: string, password: string): Promise<boolean> =>
  argon2.verify(passwordHash, password);
