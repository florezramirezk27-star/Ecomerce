# Seguridad

Registro único de las acciones de seguridad aplicadas al repositorio. Este
documento **no incluye valores de credenciales**: los secretos viven solo en
los `.env` locales, que no están versionados.

## Estado

| Área | Estado |
| --- | --- |
| Rotación de credenciales expuestas | Hecho |
| Actualización de dependencias críticas | Hecho |
| Limpieza de scripts de debug | Hecho |
| Verificación de que `.env` nunca se versionó | Hecho |

## P0 · Crítico

### 1. Rotación de credenciales

Los archivos `.env` (raíz) y `api/.env` contenían credenciales sensibles. Se
regeneraron localmente y los campos que dependen de proveedores externos
quedaron marcados como `ROTATE_REQUIRED` para rotarlos en cada panel:

- `api/.env`: `DATABASE_URL` / `DIRECT_URL` (Neon), `CLOUDINARY_API_KEY` /
  `CLOUDINARY_API_SECRET`, `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`,
  `SMTP_PASS` (Gmail App Password), `DROPI_PASSWORD`, `DROPI_2FA_SECRET`,
  `DROP_WOO_CK` / `DROP_WOO_CS`.
- `.env` (raíz): `DATABASE_URL` / `DIRECT_URL`, `CLOUDINARY_URL`,
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID` /
  `FACEBOOK_CLIENT_SECRET`, `SMTP_PASS`, `DROPI_PASSWORD`.

Los backups `.env.bak-*` que se crearon durante la rotación contenían las
credenciales antiguas, así que se eliminaron y quedaron cubiertos por
`.gitignore` (patrón `.env.bak*`).

### 2. Actualización de dependencias críticas

Aplicado en el commit `e6e6c72`:

- `next` → `^16.3.6` (apps/web): parchea 3 CVEs críticos de RCE.
- `axios` → `^1.12.0` (api): parchea ReDoS.
- `cloudinary` → `^2.7.0` (api): parchea inyección de argumentos.
- `multer` → `^2.3.0` (api) más overrides para transitivas.
- Overrides de pnpm: `shell-quote ^1.11.0`, `proxy-addr ^2.0.8`,
  `handlebars >=4.7.10`.

Resultado: sin vulnerabilidades críticas tras la actualización.

## P1 · Importante

### 3. Limpieza de scripts de debug

Se eliminaron 7 archivos `test-*.js` de `api/` que eran scripts de debug. La
documentación se conservó en `scripts/legacy-debug-tests/README.md`.

### 4. Verificación de `.env` en git

Confirmado que `.env` y `api/.env` nunca estuvieron versionados. `.gitignore`
incluye `.env`, `.env.local`, `.env.*.local`, `.env.production` y `.env.bak*`.

## Pendiente

- Rotar en cada proveedor las credenciales marcadas como `ROTATE_REQUIRED`
  (ver `api/.env` y `.env`).
