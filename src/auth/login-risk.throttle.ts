import { createHash } from 'node:crypto';

export interface LoginRiskOptions {
  freeAttempts: number;
  stepMs: number;
  maxDelayMs: number;
  windowMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface FailureBucket {
  count: number;
  expiresAt: number;
}

/**
 * Slows repeated failures for one IP and one normalized email. A different
 * IP keeps its own bucket, so this does not lock the account for everyone.
 * The delay map is process-local.
 */
export class LoginRiskThrottle {
  private readonly buckets = new Map<string, FailureBucket>();
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: LoginRiskOptions) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  async penalize(ip: string, email: string): Promise<number> {
    const bucket = this.bucket(ip, email);
    bucket.count += 1;
    bucket.expiresAt = this.now() + this.options.windowMs;
    const delay = this.delayFor(bucket.count);
    if (delay > 0) {
      await this.sleep(delay);
    }
    return delay;
  }

  clear(ip: string, email: string): void {
    this.buckets.delete(this.key(ip, email));
  }

  delayFor(count: number): number {
    if (count <= this.options.freeAttempts) {
      return 0;
    }
    const exponent = count - this.options.freeAttempts - 1;
    return Math.min(this.options.maxDelayMs, this.options.stepMs * 2 ** exponent);
  }

  private bucket(ip: string, email: string): FailureBucket {
    const key = this.key(ip, email);
    const current = this.buckets.get(key);
    if (!current || current.expiresAt <= this.now()) {
      const created = { count: 0, expiresAt: this.now() + this.options.windowMs };
      this.buckets.set(key, created);
      return created;
    }
    return current;
  }

  private key(ip: string, email: string): string {
    return createHash('sha256').update(`${ip}\0${email}`).digest('hex');
  }
}
