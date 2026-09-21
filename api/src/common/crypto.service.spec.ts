import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  const originalKey = process.env.HUB_ENCRYPTION_KEY;
  let service: CryptoService;

  beforeAll(() => {
    // Los casos de descifrado fallido registran un error a propósito; sin esto
    // la salida de los tests se llena de ruido que parece un fallo real.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    process.env.HUB_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    service = new CryptoService();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    process.env.HUB_ENCRYPTION_KEY = originalKey;
  });

  it('devuelve el secreto original tras cifrar y descifrar', () => {
    const secret = '-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n';
    const sealed = service.seal(secret);

    expect(sealed.ciphertext).not.toContain('BEGIN PRIVATE KEY');
    expect(service.open(sealed.ciphertext)).toBe(secret);
  });

  it('produce un ciphertext distinto cada vez para el mismo secreto', () => {
    // El IV es aleatorio; si dos cifrados coincidieran, el esquema filtraría
    // que dos proyectos comparten credencial.
    const a = service.seal('mismo-valor');
    const b = service.seal('mismo-valor');

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('rechaza un ciphertext manipulado en lugar de devolver basura', () => {
    const { ciphertext } = service.seal('valor original');
    const bytes = Buffer.from(ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 0xff; // altera un byte del texto cifrado

    expect(() => service.open(bytes.toString('base64'))).toThrow();
  });

  it('rechaza un payload demasiado corto', () => {
    expect(() => service.open(Buffer.from('corto').toString('base64'))).toThrow();
  });

  it('no descifra con otra clave maestra', () => {
    const { ciphertext } = service.seal('secreto');

    process.env.HUB_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const otherService = new CryptoService();

    expect(() => otherService.open(ciphertext)).toThrow();
  });

  it('exige una clave de 32 bytes', () => {
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

    it('acepta claves iguales y rechaza distintas', () => {
      expect(service.safeEquals('api-key-abc', 'api-key-abc')).toBe(true);
      expect(service.safeEquals('api-key-abc', 'api-key-xyz')).toBe(false);
    });

    it('no revienta cuando las longitudes difieren', () => {
      // timingSafeEqual exige buffers del mismo tamaño; por eso se comparan
      // hashes. Si alguien lo cambiara a comparar los valores, esto falla.
      expect(service.safeEquals('corta', 'una-clave-mucho-mas-larga')).toBe(false);
    });
  });
});
