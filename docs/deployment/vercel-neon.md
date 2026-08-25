# Producción: Vercel + Neon + Upstash

## Arquitectura

- Despliega `apps/web` como proyecto Next.js en Vercel.
- Despliega `api` como servicio Node persistente usando su `Dockerfile`; es el proceso que atiende Socket.IO, Dropi y futuros workers. Vercel enruta el frontend al servicio mediante el rewrite `/api/proxy`.
- Usa Neon Postgres para `DATABASE_URL` y Upstash Redis para `REDIS_URL`.

No coloques secretos en el repositorio ni uses valores de desarrollo en el entorno Production de Vercel.

## Variables de Vercel (proyecto web)

```text
API_URL=https://api.example.com
NEXT_PUBLIC_API_URL=/api/proxy
NEXT_PUBLIC_WS_URL=https://api.example.com
```

Configura el proyecto con `apps/web` como **Root Directory**. `API_URL` debe ser accesible solo en el servidor; no lleva el prefijo `NEXT_PUBLIC_`.

## Variables del servicio API

```text
NODE_ENV=production
PORT=3001
DATABASE_URL=<Neon pooled connection string con sslmode=require>
DIRECT_URL=<Neon direct connection string con sslmode=require>
REDIS_URL=<Upstash rediss URL>
REDIS_REQUIRED=true
JWT_SECRET=<mínimo 32 bytes aleatorios>
CORS_ORIGIN=https://www.example.com
FRONTEND_URL=https://www.example.com
GOOGLE_CALLBACK_URL=https://api.example.com/auth/google/callback
```

Añade también SMTP, Cloudinary/S3, Google OAuth, OpenAI y Dropi si utilizas esas integraciones.

## Migraciones Neon

En un único job de despliegue, antes de iniciar una nueva versión de API:

```bash
pnpm prisma migrate deploy
```

No ejecutes `prisma migrate dev` en producción. La migración actual requiere que Neon tenga habilitada la extensión `vector`.

## Verificación posterior

```bash
curl -fsS https://api.example.com/health
curl -fsS https://api.example.com/ready
```

`/ready` valida PostgreSQL y Redis. Configura el monitor del proveedor de API contra ese endpoint y solo marca el despliegue sano cuando devuelve `status: ok`.

## Escalado

Mantén al menos dos réplicas de API. Los tickets WebSocket son JWT de vida corta y se verifican en cualquier réplica; Redis queda preparado para rate limiting, colas BullMQ y locks distribuidos. Antes de añadir workers, instala BullMQ y ejecútalos como proceso independiente del servidor HTTP.
