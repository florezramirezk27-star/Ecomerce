import { checkoutSchema } from './checkout.schema';

const baseCheckout = {
  shippingName: 'Ana Ruiz',
  shippingPhone: '3001234567',
  shippingAddress: 'Calle 1 # 2-3',
  shippingCity: 'Bogotá',
  shippingState: 'Cundinamarca',
  shippingZip: '110111',
  shippingEmail: 'cliente@example.com',
  shippingDocType: 'CC',
  shippingDocNumber: '1012345678',
};

function parse(overrides: Record<string, unknown> = {}) {
  return checkoutSchema.safeParse({ ...baseCheckout, ...overrides });
}

function issueFields(result: ReturnType<typeof parse>): string[] {
  return result.success
    ? []
    : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('checkoutSchema: datos que Dropi necesita', () => {
  it('normaliza telefono, nombre, direccion y pasaporte', () => {
    const result = parse({
      shippingName: '  Ana   Ruiz ',
      shippingPhone: '+57 300 123 4567',
      shippingAddress: '  Calle 1 # 2-3 ',
      shippingCity: ' Bogotá ',
      shippingState: ' Cundinamarca ',
      shippingDocType: 'PASSPORT',
      shippingDocNumber: 'ab-12345',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.shippingName).toBe('Ana Ruiz');
    expect(result.data.shippingPhone).toBe('3001234567');
    expect(result.data.shippingAddress).toBe('Calle 1 # 2-3');
    expect(result.data.shippingCity).toBe('Bogotá');
    expect(result.data.shippingState).toBe('Cundinamarca');
    expect(result.data.shippingDocType).toBe('PP');
    expect(result.data.shippingDocNumber).toBe('AB12345');
  });

  it('acepta el telefono con indicativo 0057 o cero inicial', () => {
    for (const phone of ['0057 300 123 4567', '0 300 123 4567']) {
      const result = parse({ shippingPhone: phone });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.shippingPhone).toBe('3001234567');
    }
  });

  it('rechaza un telefono de menos de 10 digitos', () => {
    const result = parse({ shippingPhone: '300123456' });
    expect(result.success).toBe(false);
    expect(issueFields(result)).toContain('shippingPhone');
  });

  it('exige nombre y apellido para que Dropi tenga los dos campos', () => {
    const result = parse({ shippingName: 'Ana' });
    expect(result.success).toBe(false);
    expect(issueFields(result)).toContain('shippingName');
  });

  it('rechaza nombres con numeros', () => {
    const result = parse({ shippingName: 'Ana 123' });
    expect(result.success).toBe(false);
    expect(issueFields(result)).toContain('shippingName');
  });

  it('rechaza apostrofos y guiones que Dropi no acepta en el nombre', () => {
    for (const name of ["Ana O'Connor", 'Ana-Maria Ruiz']) {
      const result = parse({ shippingName: name });
      expect(result.success).toBe(false);
      expect(issueFields(result)).toContain('shippingName');
    }
  });

  it('rechaza una direccion demasiado corta', () => {
    const result = parse({ shippingAddress: 'Casa' });
    expect(result.success).toBe(false);
    expect(issueFields(result)).toContain('shippingAddress');
  });

  it('rechaza un codigo postal que no tenga 6 digitos', () => {
    const result = parse({ shippingZip: '11011' });
    expect(result.success).toBe(false);
    expect(issueFields(result)).toContain('shippingZip');
  });

  it('rechaza un correo con formato invalido', () => {
    for (const email of [
      'cliente.example.com',
      'cliente@example..com',
      'cliente@example.c',
    ]) {
      const result = parse({ shippingEmail: email });
      expect(result.success).toBe(false);
      expect(issueFields(result)).toContain('shippingEmail');
    }
  });

  it('valida el documento segun el tipo elegido', () => {
    const result = parse({
      shippingDocType: 'CC',
      shippingDocNumber: '12A34',
    });
    expect(result.success).toBe(false);
    expect(issueFields(result)).toContain('shippingDocNumber');
  });
});
