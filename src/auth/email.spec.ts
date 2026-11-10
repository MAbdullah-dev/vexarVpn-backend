import { isAsciiEmail, normalizeEmail } from './email.js';

describe('email normalization', () => {
  it('trims and lowercases before lookup and storage', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('accepts a normalized ASCII address and rejects uppercase or non-ASCII text', () => {
    expect(isAsciiEmail('user@example.com')).toBe(true);
    expect(isAsciiEmail('User@Example.com')).toBe(false);
    expect(isAsciiEmail('user@exämple.com')).toBe(false);
    expect(isAsciiEmail('not-an-email')).toBe(false);
  });
});
