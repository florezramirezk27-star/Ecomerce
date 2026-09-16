import { createHmac } from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');

  if (!cleaned) {
    throw new Error('Secret 2FA vacío');
  }

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const ch of cleaned) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) {
      throw new Error(`Carácter inválido en secret 2FA: "${ch}"`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export function hotp(secret: string, counter: number, digits = 6): string {
  const key = base32Decode(secret);

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(Math.floor(counter)));

  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binCode % 10 ** digits).toString().padStart(digits, '0');
}

export function totp(
  secret: string,
  timeSeconds: number = Math.floor(Date.now() / 1000),
  digits = 6,
  period = 30,
): string {
  const counter = Math.floor(timeSeconds / period);
  return hotp(secret, counter, digits);
}
