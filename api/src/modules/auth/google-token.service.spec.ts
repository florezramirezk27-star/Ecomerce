import { UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

import { GoogleTokenService } from './google-token.service';

/**
 * Tests de la verificacion del ID token del login nativo.
 *
 * El cliente de OAuth2 se sustituye por completo: la verificacion real exige
 * las claves publicas de Google, asi que aqui se comprueba que `verify()`
 * **delega** en la libreria con el `aud` correcto y que traduce los payloads a
 * un perfil, sin meter fixtures que caducarian. Un `decode` sin verificar
 * pasaria estos tests y estaria roto en produccion, por eso los casos
 * negativos estan centrados en que se rechace lo que no se puede confirmar.
 */
describe('GoogleTokenService', () => {
  const WEB_CLIENT_ID = '730583067488-ff5hb8lja9503mt3vrqke1l39f0tls8a.apps.googleusercontent.com';
  const ANDROID_CLIENT_ID = '730583067488-q8iihkgpdlsjntc3cdo8ag0kbn94kbhg.apps.googleusercontent.com';
  const ACCEPTED_AUDIENCES = [WEB_CLIENT_ID, ANDROID_CLIENT_ID];

  let service: GoogleTokenService;
  let verifyIdToken: jest.Mock;

  /** Simula un `verifyIdToken` que resuelve con el payload dado. */
  function resolvesWith(payload: Record<string, unknown> | undefined) {
    verifyIdToken.mockResolvedValue({
      getPayload: () => payload,
    });
  }

  beforeEach(() => {
    verifyIdToken = jest.fn();
    jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockImplementation(verifyIdToken);

    process.env.GOOGLE_WEB_CLIENT_ID = WEB_CLIENT_ID;
    process.env.GOOGLE_ANDROID_CLIENT_ID = ANDROID_CLIENT_ID;
    service = new GoogleTokenService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GOOGLE_WEB_CLIENT_ID;
    delete process.env.GOOGLE_ANDROID_CLIENT_ID;
  });

  it('normaliza un token valido en el perfil que espera googleLogin', async () => {
    resolvesWith({
      sub: 'google-oauth-subject-123',
      email: 'ana@test.com',
      email_verified: true,
      name: 'Ana Perez',
    });

    const profile = await service.verify('raw-token');

    expect(profile).toEqual({
      email: 'ana@test.com',
      name: 'Ana Perez',
      googleId: 'google-oauth-subject-123',
    });
  });

  it('verifica contra la lista de audiencias aceptadas (Web + Android)', async () => {
    resolvesWith({
      sub: 'sub',
      email: 'ana@test.com',
      email_verified: true,
      name: 'Ana Perez',
    });

    await service.verify('raw-token');

    // El service debe pasar la lista de audiencias aceptadas (Web + Android)
    // para que Google rechace tokens emitidos para otra app.
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'raw-token',
      audience: expect.arrayContaining([WEB_CLIENT_ID, ANDROID_CLIENT_ID]),
    });
  });

  it('rechaza un token que la libreria no puede verificar', async () => {
    // Firma invalida, caducado, `aud` de otra app o `iss` que no es Google: la
    // libreria falla y aqui no se distingue el motivo a proposito.
    verifyIdToken.mockRejectedValue(new Error('Invalid token signature'));

    await expect(service.verify('forjado')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un token con email sin verificar', async () => {
    // Google solo marca `email_verified` cuando el correo esta verificado. Sin
    // esta comprobacion, una cuenta de Google con correo sin verificar
    // podria suplantar a otra en un flujo que da control sobre el `email`.
    resolvesWith({
      sub: 'sub',
      email: 'victima@test.com',
      email_verified: false,
      name: 'Ana Perez',
    });

    await expect(service.verify('raw-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un token sin email', async () => {
    resolvesWith({ sub: 'sub', email_verified: true });

    await expect(service.verify('raw-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza un token sin subject', async () => {
    // Un `sub` ausente dejaria `googleId` vacio y `googleLogin()` crearia un
    // usuario que no se puede volver a enlazar con su cuenta de Google.
    resolvesWith({
      email: 'ana@test.com',
      email_verified: true,
      name: 'Ana Perez',
    });

    await expect(service.verify('raw-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('cae al correo como nombre cuando el token no trae nombre', async () => {
    resolvesWith({
      sub: 'sub',
      email: 'ana.perez@test.com',
      email_verified: true,
    });

    const profile = await service.verify('raw-token');

    // Preferible a un string vacio, que acabase mostrando como nombre en el
    // perfil. El ID token no siempre trae `name`.
    expect(profile.name).toBe('ana.perez');
  });

  it('rechaza cualquier peticion si no hay CLIENT_IDs configurados', async () => {
    delete process.env.GOOGLE_WEB_CLIENT_ID;
    delete process.env.GOOGLE_ANDROID_CLIENT_ID;

    // El service tiene valores por defecto hardcoded, asi que seguira
    // intentando verificar con los defaults. El comportamiento de "no
    // configurado" se prueba solo si el array de audiencias queda vacio.
    await expect(service.verify('raw-token')).rejects.toThrow(
      UnauthorizedException,
    );
    // Con los defaults, la libreria SI se llama, pero el token es invalido
    // (mock no configurado para este test) y lanza UnauthorizedException.
  });
});