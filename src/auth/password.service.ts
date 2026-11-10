import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHashPromise: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the same Argon2id work as a real check when the account does not
   * exist, then always reports failure.
   */
  async consumeUnknownPassword(password: string): Promise<false> {
    await this.verify(await this.dummyHash(), password);
    return false;
  }

  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);
    return this.dummyHashPromise;
  }
}
