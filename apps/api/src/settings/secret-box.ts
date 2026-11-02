import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

/** AES-256-GCM over a base64 32-byte key; format `v1:<iv>:<tag>:<ciphertext>` (all base64). */
export class SecretBox {
  private readonly key: Buffer | null;

  constructor(base64Key: string | undefined) {
    const key = base64Key ? Buffer.from(base64Key, 'base64') : null;
    this.key = key?.length === 32 ? key : null;
  }

  get available(): boolean {
    return this.key !== null;
  }

  encrypt(plain: string): string {
    if (!this.key) throw new Error('SETTINGS_ENCRYPTION_KEY is not set (32 bytes, base64)');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [PREFIX, iv, cipher.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
      .join(':');
  }

  /** Throws when the key is missing or wrong, or the value is damaged. */
  decrypt(stored: string): string {
    if (!this.key) throw new Error('SETTINGS_ENCRYPTION_KEY is not set (32 bytes, base64)');
    const [prefix, iv, tag, data] = stored.split(':');
    if (prefix !== PREFIX || !iv || !tag || data === undefined) {
      throw new Error('unknown format of the stored secret');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  }
}
