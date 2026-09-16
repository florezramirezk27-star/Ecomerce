import { hotp, totp, base32Decode } from './totp';

describe('totp', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

  it('decodifica base32 (secreto ascii 12345678901234567890)', () => {
    const decoded = base32Decode(secret);
    expect(decoded.toString()).toBe('12345678901234567890');
  });

  it('genera códigos RFC 6238 (SHA-1, 8 dígitos)', () => {
    const fixtures: Array<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];

    for (const [time, expected] of fixtures) {
      expect(totp(secret, time, 8)).toBe(expected);
    }
  });

  it('según TOTP (6 dígitos) usa ventana de 30s', () => {
    const a = totp(secret, 30, 6);
    const b = totp(secret, 59, 6);
    expect(b).toBe('287082');
    expect(a).toBe(b);
  });

  it('soporta counters grandes (HOTP 64-bit)', () => {
    const longCounter = Math.floor(20000000000 / 30);
    expect(hotp(secret, longCounter, 8)).toBe('65353130');
  });

  it('normaliza minúsculas sin espacios', () => {
    const messy = 'gezdgnbv gy3tqojqgezdgnbvgy3tqojq';
    expect(base32Decode(messy).toString()).toBe('12345678901234567890');
  });
});