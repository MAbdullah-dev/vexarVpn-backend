import { LoginRiskThrottle } from './login-risk.throttle.js';

describe('LoginRiskThrottle', () => {
  const slept: number[] = [];
  const throttle = new LoginRiskThrottle({
    freeAttempts: 3,
    stepMs: 500,
    maxDelayMs: 8000,
    windowMs: 60_000,
    now: () => 1_000,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });

  it('delays one IP and email without delaying another IP for the same email', async () => {
    expect(await throttle.penalize('10.0.0.1', 'user@example.com')).toBe(0);
    expect(await throttle.penalize('10.0.0.1', 'user@example.com')).toBe(0);
    expect(await throttle.penalize('10.0.0.1', 'user@example.com')).toBe(0);
    expect(await throttle.penalize('10.0.0.1', 'user@example.com')).toBe(500);
    expect(await throttle.penalize('10.0.0.1', 'user@example.com')).toBe(1000);
    expect(await throttle.penalize('10.0.0.2', 'user@example.com')).toBe(0);
    expect(await throttle.penalize('10.0.0.1', 'other@example.com')).toBe(0);
    expect(slept).toEqual([500, 1000]);
  });

  it('clears the bucket after a successful login for that pair', async () => {
    throttle.clear('10.0.0.1', 'user@example.com');
    expect(await throttle.penalize('10.0.0.1', 'user@example.com')).toBe(0);
  });

  it('caps the delay', () => {
    expect(throttle.delayFor(8)).toBe(8000);
    expect(throttle.delayFor(12)).toBe(8000);
  });
});
