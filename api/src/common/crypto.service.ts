import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // recommended for GCM
const TAG_BYTES = 16;

export interface SealedSecret {
  ciphertext: string;
  keyVersion: number;
  fingerprint: string;
}

/**
 * The single place in the system where a secret is encrypted and decrypted.
 *
 * The database stores the keys the group's fourteen sites use to send their
 * metrics. If that table leaks in a dump, encryption is what separates a scare
 * from an incident: the master key lives in HUB_ENCRYPTION_KEY, outside the
 * database, so whoever has the dump has nothing to decrypt it with.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const raw = process.env.HUB_ENCRYPTION_KEY;
    if (!raw) {
      throw new InternalServerErrorException(
        'Falta HUB_ENCRYPTION_KEY. Genera una con: openssl rand -base64 32',
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException(
        `HUB_ENCRYPTION_KEY debe ser de 32 bytes en base64 (recibidos ${key.length}). ` +
          'Genera una con: openssl rand -base64 32',
      );
    }
    this.key = key;
  }

  /** Encrypts a secret and returns what goes into the `credential` table. */
  seal(plaintext: string, keyVersion = 1): SealedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      // iv ‖ authTag ‖ ciphertext, so the format is self-contained.
      ciphertext: Buffer.concat([iv, tag, encrypted]).toString('base64'),
      keyVersion,
      fingerprint: this.fingerprint(plaintext),
    };
  }

  /** Decrypts. Throws if the text was tampered with: GCM authenticates, it doesn't just encrypt. */
  open(ciphertext: string): string {
    let payload: Buffer;
    try {
      payload = Buffer.from(ciphertext, 'base64');
    } catch {
      throw new InternalServerErrorException('Credencial ilegible: base64 inválido');
    }
    if (payload.length <= IV_BYTES + TAG_BYTES) {
      throw new InternalServerErrorException('Credencial ilegible: payload demasiado corto');
    }

    const iv = payload.subarray(0, IV_BYTES);
    const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = payload.subarray(IV_BYTES + TAG_BYTES);

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      // The detail isn't logged: GCM's error message adds nothing actionable
      // and it does tell "wrong key" apart from "tampered text".
      this.logger.error('Failed to decrypt a credential (rotated key or corrupt data)');
      throw new InternalServerErrorException('No se pudo descifrar la credencial');
    }
  }

  /**
   * Fingerprint of the plaintext value. Lets us check that a key rotation kept
   * the secret without ever decrypting or logging it.
   */
  fingerprint(plaintext: string): string {
    return createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 16);
  }

  /**
   * Constant-time API key comparison. `timingSafeEqual` requires equal
   * lengths, so the hashes are compared instead of the values.
   */
  safeEquals(a: string, b: string): boolean {
    const ha = createHash('sha256').update(a, 'utf8').digest();
    const hb = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(ha, hb);
  }
}
