import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const originalKey = process.env.HUB_ENCRYPTION_KEY;
  let service: CryptoService;

  beforeAll(() => {
    // The failed-decryption cases log an error on purpose; without this the
    // test output fills up with noise that looks like a real failure.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    process.env.HUB_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    service = new CryptoService();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    process.env.HUB_ENCRYPTION_KEY = originalKey;
  });

  it('returns the original secret after sealing and opening', () => {
    const secret = '-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n';
    const sealed = service.seal(secret);

    expect(sealed.ciphertext).not.toContain('BEGIN PRIVATE KEY');
    expect(service.open(sealed.ciphertext)).toBe(secret);
  });

  it('produces a different ciphertext each time for the same secret', () => {
    // The IV is random; if two encryptions matched, the scheme would leak
    // that two projects share a credential.
    const a = service.seal('same-value');
    const b = service.seal('same-value');

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('rejects a tampered ciphertext instead of returning garbage', () => {
    const { ciphertext } = service.seal('original value');
    const bytes = Buffer.from(ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 0xff; // flip a byte of the ciphertext

    expect(() => service.open(bytes.toString('base64'))).toThrow();
  });

  it('rejects a payload that is too short', () => {
    expect(() => service.open(Buffer.from('short').toString('base64'))).toThrow();
  });

  it('does not decrypt with another master key', () => {
    const { ciphertext } = service.seal('secret');

    process.env.HUB_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const otherService = new CryptoService();

    expect(() => otherService.open(ciphertext)).toThrow();
  });

  it('requires a 32-byte key', () => {
    process.env.HUB_ENCRYPTION_KEY = randomBytes(16).toString('base64');
    expect(() => new CryptoService()).toThrow(/32 bytes/);

    delete process.env.HUB_ENCRYPTION_KEY;
    expect(() => new CryptoService()).toThrow(/HUB_ENCRYPTION_KEY/);
  });

  describe('safeEquals', () => {
    beforeEach(() => {
      process.env.HUB_ENCRYPTION_KEY = randomBytes(32).toString('base64');
      service = new CryptoService();
    });

    it('accepts equal keys and rejects different ones', () => {
      expect(service.safeEquals('api-key-abc', 'api-key-abc')).toBe(true);
      expect(service.safeEquals('api-key-abc', 'api-key-xyz')).toBe(false);
    });

    it('does not blow up when the lengths differ', () => {
      // timingSafeEqual requires buffers of the same size; that's why hashes
      // are compared. If someone changed it to compare the values, this fails.
      expect(service.safeEquals('short', 'a-much-much-longer-key')).toBe(false);
    });
  });
});
