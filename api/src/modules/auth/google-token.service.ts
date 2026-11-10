import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

/**
 * Verifica el ID token que envia la app movil en el login nativo de Google.
 *
 * El flujo web (`GET /auth/google`) no necesita esto: Passport ya autentico al
 * usuario y entrego un perfil trustworthy. El flujo nativo no pasa por Passport,
 * porque no hay redirect de browser que abrir: la app pide el ID token con
 * `google_sign_in` y lo manda aqui como cadena. Lo unico que llega es una cadena
 * que dice "soy fulano", y por si sola no prueba nada: cualquiera puede
 * fabricarla. Este servicio es lo que convierte esa cadena en una sesion real.
 *
 * Por eso la verificacion NO es opcional ni un simple `decode`: hay que
 * comprobar la firma contra las claves publicas de Google, que el `aud` sea
 * nuestro cliente, que el emisor sea Google y que no haya expirado. Un
 * `decode` sin verificar permitiria que alguien fabricase un token con
 * `aud` de otra app y seeljase el id de cualquier cuenta.
 */
@Injectable()
export class GoogleTokenService {
  /**
   * Cliente de OAuth2, compartido porque su pool de claves publicas de Google
   * es lo unico que se mantiene en memoria.
   */
  private readonly client = new OAuth2Client();

  /**
   * IDs de cliente aceptados (Web + Android). Se cargan desde variables de entorno
   * o se usan los defaults de tu proyecto (google-services.json).
   */
  private readonly acceptedAudiences: string[] = [
    process.env.GOOGLE_WEB_CLIENT_ID || '730583067488-ff5hb8lja9503mt3vrqke1l39f0tls8a.apps.googleusercontent.com',
    process.env.GOOGLE_ANDROID_CLIENT_ID || '730583067488-q8iihkgpdlsjntc3cdo8ag0kbn94kbhg.apps.googleusercontent.com',
  ].filter(Boolean);

  /**
   * Verifica el token y devuelve el perfil normalizado.
   *
   * El `aud` del ID token puede ser el **Web client ID** o el **Android client ID**.
   * Google emite el ID token contra el cliente que solicito el login (web o nativo),
   * asi que aceptamos ambos.
   *
   * Lanza `UnauthorizedException` con un mensaje generico ante cualquier token
   * invalido. El motivo concreto no se devuelve al cliente.
   */
  async verify(idToken: string): Promise<{
    email: string;
    name: string;
    googleId: string;
  }> {
    if (this.acceptedAudiences.length === 0) {
      throw new UnauthorizedException('Login con Google no disponible');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.acceptedAudiences,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token de Google invalido');
    }

    const email = payload?.email;
    const subject = payload?.sub;

    if (!email || !subject || payload?.email_verified !== true) {
      throw new UnauthorizedException('Token de Google incompleto');
    }

    return {
      email,
      name: payload?.name?.trim() || email.split('@')[0],
      googleId: subject,
    };
  }
}
