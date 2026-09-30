# Correo transaccional: Resend + dominio propio

Guía de configuración del correo que envía la tienda (facturas, estado de
pedidos, recuperación de contraseña) desde la API en Render.

## Por qué se necesita un dominio propio

El remitente de un correo debe ser de un dominio que **tú controlas**:

1. La factura sale "desde Kronio Market" con una dirección tipo
   `hola@tudominio.com`. Si el remitente es `kroniomarket26@gmail.com`, el
   correo está mintiendo sobre su origen: está usando el dominio de Gmail, que
   no es tuyo, y los filtros de Gmail/Outlook lo tratan como suplantación o
   spam. Prácticamente ninguna plataforma de envío te deja mandar desde un
   dominio ajeno.
2. Resend (como cualquier servicio de envío) necesita **prueba de que el
   dominio es tuyo** antes de mandar correo por él. Esa prueba se hace con
   registros DNS (SPF y DKIM) que solo el dueño del dominio puede crear.
3. El remitente gratuito `onboarding@resend.dev` es el "sandbox" de Resend:
   **solo entrega al correo de la cuenta dueña**. A clientes reales no llega
   nada, y por eso las facturas nunca se recibían.
4. Usar el Gmail directamente por SMTP tampoco funciona en Render: los puertos
   SMTP (25, 465, 587) están bloqueados en todos los planes, y Gmail no acepta
   correo transaccional automatizado desde una cuenta normal a volumen.

El dominio no necesita hosting ni plan de correo: con unos 12 USD/año
(`.com`) ya sirve. Es un gasto único de infraestructura, como la API o la base
de datos.

## Paso 1: registra el dominio

- Recomendado: `kroniomarket.com` (más barato y el TLD con mejor reputación).
  Alternativa: `kroniomarket.co`.
- Registrar en GoDaddy, Namecheap o Hostinger (los tres incluyen panel DNS: no
  hace falta hosting aparte).
- Espera 1–2 minutos a que el dominio active su DNS.

## Paso 2: verifica un subdominio en Resend

Usar el subdominio `mail.tudominio.com` deja el apex libre para el sitio y
evita tocar registros que otro servicio pueda estar usando.

1. Entra a https://resend.com/domains → **Add Domain**.
2. Escribe `mail.tudominio.com`.
3. Resend genera **3 registros** que debes copiar **exactamente como vienen**
   (Name / Type / Value): MX (bounces), SPF (TXT `v=spf1 include:amazonses.com
   ~all`) y DKIM (TXT `resend._domainkey`).
4. En el panel DNS del registrar, crea esos 3 registros. No edites los valores.
5. En Resend pulsa **Verify** (o espera la propagación). Verde = verificado.
   Normalmente <10 min; a veces hasta unas horas.

## Paso 3: `MAIL_FROM` en Render

```text
MAIL_FROM=Kronio Market <hola@mail.tudominio.com>
```

- Guarda la variable: Render redespliega solo.
- **Nunca** pongas aquí `@gmail.com` ni `onboarding@resend.dev`: son justo los
  dos remitentes que Resend rechaza.

## Paso 4: rota la clave expuesta (en este orden)

Si la clave de Resend llegó a filtrarse (por ejemplo, por un chat):

1. https://resend.com/api-keys → crea una clave nueva.
2. Render → sustituye `RESEND_API_KEY` por la nueva → guarda.
3. Recién ahí revoca la vieja en Resend.

Si revocas la vieja antes de actualizar Render, el correo se cae del todo.

## Paso 5: prueba

Admin → **Seguridad** → **Enviar correo de prueba**.

Esperado:

```text
Correo enviado a kroniomarket26@gmail.com vía Resend.
Desde Kronio Market <hola@mail.tudominio.com>.
```

Revisa también la bandeja de Spam.

## Código involucrado

- `api/src/modules/mail/mail.service.ts`: `mailFrom()` elige el remitente
  (`MAIL_FROM` → `SMTP_FROM` → `onboarding@resend.dev`); con `RESEND_API_KEY`
  el envío sale por la API HTTP de Resend y el bloque SMTP se ignora.
- Panel de prueba: `apps/web/app/admin/security/page.tsx` (POST `/mail/test`).
  El diagnóstico devuelve el transporte y el motivo del rechazo.

## Si aparece un error en el botón de prueba

| Error | Causa | Solución |
|---|---|---|
| `Resend (HTTP 403/422): ... domain is not verified` | `MAIL_FROM` usa un dominio no verificado (p. ej. `@gmail.com`) | Paso 2 + Paso 3 |
| `Resend (HTTP 401): ...` | Clave revocada o mal escrita | Paso 4 (rotar en orden) |
| `No se pudo llamar a Resend: ...` | Red o API de Resend caída | Reintenta; revisa logs |
| `sin transporte de correo configurado` | Ni `RESEND_API_KEY` ni SMTP en Render | Poner una clave válida |

## Nota: las respuestas de los clientes

`hola@mail.tudominio.com` es solo de salida. Para que las respuestas lleguen a
`kroniomarket26@gmail.com` configura reenvío: ver
[correo-reenvio.md](correo-reenvio.md).