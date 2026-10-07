import { frontendUrl, isLocalOrigin, isOriginAllowed } from './origins';

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe('frontendUrl', () => {
  it('usa FRONTEND_URL cuando esta definido', () => {
    process.env.FRONTEND_URL = 'https://tienda.example.com';
    expect(frontendUrl()).toBe('https://tienda.example.com');
  });

  it('ignora el origen de la peticion si FRONTEND_URL esta definido', () => {
    // En produccion manda la variable: el origen de la peticion no decide.
    process.env.FRONTEND_URL = 'https://tienda.example.com';
    expect(frontendUrl({ headers: { origin: 'http://localhost:3002' } })).toBe(
      'https://tienda.example.com',
    );
  });

  it('sigue al puerto del frontend cuando FRONTEND_URL no esta', () => {
    delete process.env.FRONTEND_URL;
    expect(frontendUrl({ headers: { origin: 'http://localhost:3002' } })).toBe(
      'http://localhost:3002',
    );
  });

  it('quita la barra final de FRONTEND_URL para no duplicar separadores', () => {
    process.env.FRONTEND_URL = 'https://tienda.example.com/';
    expect(frontendUrl()).toBe('https://tienda.example.com');
  });

  it('cae a 3000 si no hay variable ni origen de loopback', () => {
    delete process.env.FRONTEND_URL;
    expect(frontendUrl()).toBe('http://localhost:3000');
  });

  it('no acepta un origen externo como destino del redirect', () => {
    delete process.env.FRONTEND_URL;
    expect(
      frontendUrl({ headers: { origin: 'https://atacante.example' } }),
    ).toBe('http://localhost:3000');
  });

  it('no acepta esquemas que no sean http', () => {
    delete process.env.FRONTEND_URL;
    expect(frontendUrl({ headers: { origin: 'https://localhost:3002' } })).toBe(
      'http://localhost:3000',
    );
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['https://tienda.example.com'];

  it('permite sin Origin (curl, server-to-server, health checks)', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed('', allowed)).toBe(true);
  });

  it('permite los origenes de la lista', () => {
    expect(isOriginAllowed('https://tienda.example.com', allowed)).toBe(true);
  });

  it('rechaza un origen que no esta en la lista', () => {
    expect(isOriginAllowed('https://otro.example.com', allowed)).toBe(false);
  });

  it('rechaza un origen tipo loopback en produccion', () => {
    process.env.NODE_ENV = 'production';
    expect(isOriginAllowed('http://localhost:3002', allowed)).toBe(false);
  });

  it('acepta cualquier puerto de loopback en desarrollo', () => {
    process.env.NODE_ENV = 'development';
    expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:3002', allowed)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3002', allowed)).toBe(true);
  });

  it('sigue rechazando en desarrollo lo que no sea loopback', () => {
    process.env.NODE_ENV = 'development';
    expect(isOriginAllowed('https://atacante.example', allowed)).toBe(false);
  });
});

describe('isLocalOrigin', () => {
  it('rechaza el prefijo astuto evil-localhost', () => {
    expect(isLocalOrigin('http://evil-localhost')).toBe(false);
    expect(isLocalOrigin('http://localhost.evil.example')).toBe(false);
    expect(isLocalOrigin('http://notlocalhost')).toBe(false);
  });
});
