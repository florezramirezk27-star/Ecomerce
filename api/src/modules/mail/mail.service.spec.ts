import { MailService } from './mail.service';

const ENV_MAIL = [
  'RESEND_API_KEY',
  'MAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
];

/** Argumentos de la llamada a `fetch` que el servicio manda a Resend. */
interface FetchRequest {
  headers: Record<string, string>;
  body: string;
}

/** Respuesta mínima que devuelve el mock de `fetch`. */
interface FetchResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

/** Cuerpo JSON enviado a Resend, tal como lo leen los tests. */
interface ResendBody {
  to?: string[];
  html?: string;
  text?: string;
  from?: string;
}

/** Parte privada de `MailService` que solo los tests necesitan leer. */
type MailServiceTestable = { transporter: unknown };

describe('MailService: envio por API HTTP (Resend)', () => {
  const original: Record<string, string | undefined> = {};
  let fetchMock: jest.Mock<
    Promise<FetchResponse>,
    [string, FetchRequest],
    unknown
  >;

  beforeEach(() => {
    for (const k of ENV_MAIL) original[k] = process.env[k];
    for (const k of ENV_MAIL) delete process.env[k];

    fetchMock = jest.fn<
      Promise<FetchResponse>,
      [string, FetchRequest],
      unknown
    >();
    (globalThis as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    for (const k of ENV_MAIL) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    jest.restoreAllMocks();
  });

  const cuerpo = (): ResendBody =>
    JSON.parse(fetchMock.mock.calls[0][1].body) as ResendBody;

  it('con RESEND_API_KEY manda por HTTP y no toca nodemailer', async () => {
    process.env.RESEND_API_KEY = 're_123';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'abc-123' }),
    });

    const service = new MailService();
    await service.onModuleInit();

    const ok = await service.sendOrderStatusEmail(
      'cliente@correo.com',
      'Ana',
      'cm1234567890',
      'SHIPPED',
    );

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer re_123',
    );
  });

  it('con la API puesta no sondea los puertos SMTP', async () => {
    // El arranque en Render se comia 15s de timeout contra un puerto bloqueado
    // que ya no importa. Si hay API HTTP, ni se intenta.
    process.env.RESEND_API_KEY = 're_123';
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'kronio@gmail.com';
    process.env.SMTP_PASS = 'app-password';

    const service = new MailService();
    await service.onModuleInit();

    expect((service as unknown as MailServiceTestable).transporter).toBeNull();
  });

  it('envia el html y su version en texto plano', async () => {
    process.env.RESEND_API_KEY = 're_123';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'x' }),
    });

    const service = new MailService();
    await service.onModuleInit();
    await service.sendPasswordResetEmail(
      'cliente@correo.com',
      'Ana',
      'https://tienda.com/reset?token=abc',
    );

    const body = cuerpo();
    expect(body.to).toEqual(['cliente@correo.com']);
    expect(body.html).toContain('Restablecer contraseña');
    // El texto plano no es opcional para Resend: sin el, los clientes que no
    // pintan HTML ven un correo vacio.
    expect(body.text).toContain('https://tienda.com/reset?token=abc');
  });

  it('usa MAIL_FROM y no el SMTP_FROM de Gmail', async () => {
    // El dominio de Gmail no esta verificado en Resend: si se usara, el envio
    // lo rechazaria por remitente no verificado.
    process.env.RESEND_API_KEY = 're_123';
    process.env.MAIL_FROM = 'Kronio <hola@kroniomarket.co>';
    process.env.SMTP_FROM = 'kroniomarket26@gmail.com';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'x' }),
    });

    const service = new MailService();
    await service.onModuleInit();
    await service.sendOrderStatusEmail(
      'cliente@correo.com',
      'Ana',
      'cm1234567890',
      'PAID',
    );

    expect(cuerpo().from).toBe('Kronio <hola@kroniomarket.co>');
  });

  it('devuelve false y explica cuando el proveedor rechaza', async () => {
    process.env.RESEND_API_KEY = 're_123';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"message":"domain not verified"}'),
    });

    const service = new MailService();
    await service.onModuleInit();
    const ok = await service.sendOrderStatusEmail(
      'cliente@correo.com',
      'Ana',
      'cm1234567890',
      'PAID',
    );

    // Falso, no una excepcion: un correo que no sale no debe tumbar el pedido.
    expect(ok).toBe(false);
  });

  it('devuelve false si la llamada se corta, sin tumbar el pedido', async () => {
    process.env.RESEND_API_KEY = 're_123';
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    const service = new MailService();
    await service.onModuleInit();
    const ok = await service.sendOrderStatusEmail(
      'cliente@correo.com',
      'Ana',
      'cm1234567890',
      'PAID',
    );

    expect(ok).toBe(false);
  });

  it('sin RESEND_API_KEY vuelve al camino SMTP', async () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'kronio@gmail.com';
    process.env.SMTP_PASS = 'app-password';

    const service = new MailService();
    await service.onModuleInit();

    // Se construye el transporter de nodemailer, asi que no se llama a fetch.
    expect(
      (service as unknown as MailServiceTestable).transporter,
    ).not.toBeNull();
  });

  it('el diagnostico no pide autenticacion SMTP cuando el envio es por HTTP', async () => {
    process.env.RESEND_API_KEY = 're_123';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'x' }),
    });

    const service = new MailService();
    await service.onModuleInit();
    const res = await service.sendTestEmail('admin@correo.com');

    // Antes de esto decia "fallo al autenticar con smtp.gmail.com" en un envio
    // que si funcionaba, porque siempre preguntaba por SMTP.
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('el diagnostico devuelve el motivo real cuando Resend rechaza', async () => {
    // El panel solo decia "El mensaje no pudo enviarse (revisa los logs del
    // servicio)" y el motivo quedaba escondido en el log. Ahora el motivo debe
    // llegar a la respuesta.
    process.env.RESEND_API_KEY = 're_123';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"message":"domain not verified"}'),
    });

    const service = new MailService();
    await service.onModuleInit();
    const res = await service.sendTestEmail('cliente@correo.com');

    expect(res.ok).toBe(false);
    expect(res.error).toContain('HTTP 422');
    expect(res.error).toContain('domain not verified');
  });

  it('el diagnostico dice cual es el transporte y quien remite', async () => {
    // El panel de admin imprimia "SMTP: ? → ?" con un envio correcto por HTTP:
    // no hay host SMTP que mostrar cuando no se usa SMTP.
    process.env.RESEND_API_KEY = 're_123';
    process.env.MAIL_FROM = 'Kronio <hola@kroniomarket.co>';
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'x' }),
    });

    const service = new MailService();
    await service.onModuleInit();
    const res = await service.sendTestEmail('admin@correo.com');

    expect(res.transport).toBe('resend');
    expect(res.remitente).toBe('Kronio <hola@kroniomarket.co>');
  });

  it('el diagnostico reporta smtp cuando es el transporte', async () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'kronio@gmail.com';
    process.env.SMTP_PASS = 'app-password';

    const service = new MailService();
    await service.onModuleInit();
    const res = await service.sendTestEmail('sin-destino');

    expect(res.transport).toBe('smtp');
    expect(res.ok).toBe(false);
  });
});
