import { randomBytes } from 'node:crypto';
import { SecretBox } from './secret-box';

const key = () => randomBytes(32).toString('base64');

describe('SecretBox', () => {
  it('round-trips and does not leak the plaintext', () => {
    const box = new SecretBox(key());
    const enc = box.encrypt('ghp_secret');
    expect(enc).not.toContain('ghp_secret');
    expect(box.decrypt(enc)).toBe('ghp_secret');
  });

  it('uses a fresh IV per value', () => {
    const box = new SecretBox(key());
    expect(box.encrypt('a')).not.toBe(box.encrypt('a'));
  });

  it('fails with another key', () => {
    const enc = new SecretBox(key()).encrypt('x');
    expect(() => new SecretBox(key()).decrypt(enc)).toThrow();
  });

  it('is unavailable without a valid key', () => {
    for (const k of [undefined, '', 'c2hvcnQ=']) {
      const box = new SecretBox(k);
      expect(box.available).toBe(false);
      expect(() => box.encrypt('x')).toThrow(/SETTINGS_ENCRYPTION_KEY/);
    }
  });
});
