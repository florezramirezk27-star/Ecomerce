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
   * Verifica el token y devuelve el perfil normalizado.
   *
   * El `aud` del ID token es el **Web client ID** de la app movil, no el de
   * iOS/Android. Google lo emite siempre contra el cliente web que autorizo el
   * intercambio, asi que es el unico que hay que comparar aqui.
   *
   * El resultado se pasa por `googleLogin()` tal cual, igual que el perfil que
   * entrega la `GoogleStrategy`: `{email, name, googleId}`. `googleId` es el
   * `sub` del token, que es el mismo valor que `profile.id` del flujo web, de
   * modo que una cuenta creada por web queda enlazada al entrar por aqui sin
   * migrar nada.
   *
   * Lanza `UnauthorizedException` con un mensaje generico ante cualquier token
   * invalido. El motivo concreto no se devuelve al cliente: distinguir "firma
   * invalida" de "token expirado" ayuda a quien ataca a probar variantes, y el
   * usuario no puede hacer nada distinto segun el motivo.
   */
  async verify(idToken: string): Promise<{
    email: string;
    name: string;
    googleId: string;
  }> {
    const clientId: string | undefined = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new UnauthorizedException('Login con Google no disponible');
    }

    // `getPayload()` devuelve `any`. Se tipa como `TokenPayload` para no
    // propagar ese `any` al resto del metodo: `TokenPayload` declara los claims
    // que se usan aqui, asi que un claim mal escrito pasaria a ser un error de
    // TypeScript y no un `undefined` en silencio.
    let payload: TokenPayload | undefined;
    try {
      // `verifyIdToken` comprueba en una sola llamada: firma contra las claves
      // publicas de Google, `aud`, `iss`, `exp` y `nbf`. No hace falta (ni
      // debe hacerse) un `decode` previo para leer el payload.
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token de Google invalido');
    }

    const email = payload?.email;
    const subject = payload?.sub;

    // Un token valido por firma puede no tener `email_verified`: Google solo lo
    // incluye cuando el correo esta verificado. Sin esa comprobacion, una
    // cuenta de Google con correo sin verificar podria suplantar a otra. Un
    // token sin `sub` es imposible en un ID token legitimo, asi que se trata
    // como invalido en vez de inventar un googleId vacio.
    if (!email || !subject || payload?.email_verified !== true) {
      throw new UnauthorizedException('Token de Google incompleto');
    }

    return {
      email,
      // El ID token no siempre trae `name`. Se cae al propio correo, que si
      // viene siempre, en vez de un string vacio que luego se muestra en un
      // perfil como nombre de la persona.
      name: payload?.name?.trim() || email.split('@')[0],
      googleId: subject,
    };
  }
}
