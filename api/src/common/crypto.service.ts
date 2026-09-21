import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // recomendado para GCM
const TAG_BYTES = 16;

export interface SealedSecret {
  ciphertext: string;
  keyVersion: number;
  fingerprint: string;
}

/**
 * Único punto del sistema donde se cifra y descifra un secreto.
 *
 * En la base guardamos las claves con las que los catorce sitios del grupo
 * envían sus métricas. Si esa tabla se filtra en un volcado, el cifrado es lo
 * que separa un susto de un incidente: la clave maestra vive en
 * HUB_ENCRYPTION_KEY, fuera de la base, así que quien tenga el volcado no
 * tiene con qué descifrarlo.
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

  /** Cifra un secreto y devuelve lo que va a la tabla `credential`. */
  seal(plaintext: string, keyVersion = 1): SealedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      // iv ‖ authTag ‖ ciphertext, para que el formato sea autocontenido.
      ciphertext: Buffer.concat([iv, tag, encrypted]).toString('base64'),
      keyVersion,
      fingerprint: this.fingerprint(plaintext),
    };
  }

  /** Descifra. Lanza si el texto fue manipulado: GCM autentica, no solo cifra. */
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
      // No se registra el detalle: el mensaje de error de GCM no aporta nada
      // accionable y sí distingue "clave mala" de "texto manipulado".
      this.logger.error('Fallo al descifrar una credencial (clave rotada o dato corrupto)');
      throw new InternalServerErrorException('No se pudo descifrar la credencial');
    }
  }

  /**
   * Huella del valor en claro. Permite comprobar que una rotación de clave ha
   * conservado el secreto sin llegar a descifrarlo ni registrarlo.
   */
  fingerprint(plaintext: string): string {
    return createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 16);
  }

  /**
   * Comparación de API keys en tiempo constante. `timingSafeEqual` exige
   * longitudes iguales, así que se comparan los hashes y no los valores.
   */
  safeEquals(a: string, b: string): boolean {
    const ha = createHash('sha256').update(a, 'utf8').digest();
    const hb = createHash('sha256').update(b, 'utf8').digest();
    return timingSafeEqual(ha, hb);
  }
}
