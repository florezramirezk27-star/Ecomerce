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
  const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

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

    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    service = new GoogleTokenService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
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
      // El `sub` del ID token es el identificador de la cuenta de Google, el
      // mismo valor que `profile.id` devuelve el flujo web. Por eso una cuenta
      // creada autenticandose en el navegador queda enlazada al entrar por aqui.
      googleId: 'google-oauth-subject-123',
    });
  });

  it('verifica contra el GOOGLE_CLIENT_ID, no contra otro cliente', async () => {
    resolvesWith({
      sub: 'sub',
      email: 'ana@test.com',
      email_verified: true,
      name: 'Ana Perez',
    });

    await service.verify('raw-token');

    // Sin `audience`, la libreria aceptaria un token emitido para otra app,
    // que es justo el ataque que hace falta cerrar.
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'raw-token',
      audience: CLIENT_ID,
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

  it('rechaza cualquier peticion si GOOGLE_CLIENT_ID no esta configurado', async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    await expect(service.verify('raw-token')).rejects.toThrow(
      UnauthorizedException,
    );
    // Sin `aud` con que comparar, verificar no tiene sentido: ni se llama a la
    // libreria, para no gastar una llamada remota en un despliegue mal
    // configurado.
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
