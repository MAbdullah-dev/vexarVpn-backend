import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('verifies an Argon2id hash and rejects a different password', async () => {
    const hash = await passwords.hash('correct-horse-battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await passwords.verify(hash, 'correct-horse-battery')).toBe(true);
    expect(await passwords.verify(hash, 'wrong-horse-battery')).toBe(false);
  });

  it('reports failure for an unknown account after doing hash work', async () => {
    expect(await passwords.consumeUnknownPassword('correct-horse-battery')).toBe(false);
  });
});
