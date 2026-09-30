# Reenvío de respuestas de correo del dominio a Gmail

Las facturas y avisos salen desde `hola@mail.tudominio.com` (dominio verificado
en Resend, ver [correo-transaccional.md](correo-transaccional.md)). Ese correo
es **solo de salida**: no tiene buzón, así que un cliente que responda a la
factura recibiría un rebote. Este documento configura que esas respuestas
caigan en la bandeja real de la tienda (`kroniomarket26@gmail.com`).

## Opción A: Cloudflare Email Routing (gratis, recomendada)

Requiere pasar los nameservers del dominio a Cloudflare; el resto del DNS se
gestiona ahí (también se pueden mantener los registros de Resend).

1. Crea una cuenta en https://dash.cloudflare.com.
2. **Add a site** → añade `tudominio.com` → Cloudflare te da 2 nameservers.
3. En el registrar, cambia los nameservers del dominio por los de Cloudflare
   (propagación: minutos a horas).
4. En Cloudflare → zona del dominio → **Email** → **Email Routing** → actívalo.
5. Agrega la regla: `hola@mail.tudominio.com` → destino
   `kroniomarket26@gmail.com`.
6. Verifica el destino: Cloudflare te envía un correo de confirmación a
   Gmail; pulsa el enlace.
7. Cloudflare crea automáticamente los registros MX/DKIM necesarios. Si ya
   tenías registros MX (por ejemplo los de Resend), confirma que no se pisan;
   si chocan, conserva los de Resend y agrega la regla de reenvío sobre el
   subdominio `mail.`.

## Opción B: reenvío del propio registrar (sin cambiar nada)

- GoDaddy: **Email Forwarding** incluido con el dominio → crea
  `hola@mail.tudominio.com` → `kroniomarket26@gmail.com`.
- Namecheap: **Domain → Forward Email** (fundamental, gratis).
- Hostinger: reenvío disponible en el panel de dominio/correo.

Verifica el buzón de destino cuando pidas crear el reenvío (algunos enviudan
un correo de confirmación).

## Opción C: buzón real gratuito (si más adelante quieren IMAP)

- **Zoho Mail**: plan gratuito para 1 buzón (`hola@tudominio.com`) con
  webmail y configuración SMTP/IMAP. Requiere apuntar MX del dominio a Zoho.
- Útil si la tienda necesita *enviar* desde el dominio (aparte de Resend) o
  leer correo desde el celular con otra app.

## Verificación final

1. Manda el correo de prueba desde **Admin → Seguridad → Enviar correo de
   prueba**.
2. En Gmail escribe a `hola@mail.tudominio.com` y entra:
   - Revisa que no rebote.
   - Debería aparecer en la bandeja de `kroniomarket26@gmail.com` (o en Spam
     la primera vez: márcalo como "No es spam").