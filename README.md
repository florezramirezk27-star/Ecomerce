# Kronio Market

Plataforma de ecommerce completa orientada al mercado colombiano, con chatbot de ventas con IA, panel de administracion e integracion con Dropi para dropshipping.

## Arquitectura

Monorepo gestionado con **pnpm workspaces** compuesto por dos aplicaciones:

- **`api/`** — Backend REST + WebSocket construido con **NestJS 11** (puerto 3001)
- **`apps/web/`** — Frontend SSR construido con **Next.js 16** (puerto 3000)

### Stack tecnologico

| Capa | Tecnologias |
|------|-------------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion, Recharts |
| Backend | NestJS 11, Express 5, Prisma 6 (PostgreSQL), Socket.IO |
| IA / Chatbot | Google Gemini (Vercel AI SDK), OpenAI embeddings, RAG con pgvector |
| Autenticacion | JWT + sesiones server-side, Google OAuth, CSRF, bcrypt |
| Base de datos | PostgreSQL (Neon), Redis (Upstash) |
| Upload de imagenes | Cloudinary, AWS S3 |
| Email | Nodemailer (SMTP) |
| Dropshipping | Dropi (plataforma colombiana) |
| Despliegue | Vercel (frontend), Docker/Render (API), GitHub Actions CI |
| Empaquetado | pnpm 9.15.4 (workspaces), TypeScript 5.9 |

---

## Base de datos

### Modelos (Prisma)

| Modelo | Descripcion |
|--------|-------------|
| `User` | Usuarios con roles (ADMIN/CUSTOMER), bloqueo por intentos fallidos, tokens de recuperacion |
| `Session` | Sesiones server-side vinculadas a JWT |
| `Category` | Categorias de productos |
| `Product` | Productos con precio, stock, galeria de imagenes, video, vinculo a Dropi |
| `ProductEmbedding` | Embeddings vectoriales (pgvector, 1536 dim) para busqueda semantica |
| `DiscountCode` | Codigos de descuento (porcentaje/fijo, flash deals, usos maximos, expiracion) |
| `Cart` / `CartItem` | Carrito de compras por usuario |
| `Order` | Pedidos con estados (PENDING/PAID/SHIPPED/DELIVERED/CANCELLED), datos de envio, idempotencyKey |
| `OrderItem` | Items del pedido |
| `OrderTracking` | Seguimiento de envios via Dropi/Aveonline (transportadora, estado, eventos, guia, respuesta cruda) |
| `ChatSession` | Sesiones de chat con estados de conversacion (EXPLORING -> COMPARING -> INTENT_TO_BUY -> CHECKOUT_READY) |
| `ChatMessage` | Mensajes del chat con soporte para tool calls y resultados |

### Migraciones

21 migraciones desde mayo 2026 hasta septiembre 2026.

---

## Funcionalidades implementadas

### 1. Autenticacion y seguridad

- Registro con nombre/email/password
- Login con JWT + cookie httpOnly + cookie CSRF
- Login con Google OAuth (flujo de intercambio de codigo)
- Recuperacion de contrasena por email con tokens
- Refresco de sesiones
- Cierre de sesion (individual y forzado — todas las sesiones)
- Bloqueo de cuenta: 5 intentos fallidos -> bloqueo de 15 minutos
- Tickets de autenticacion para WebSocket
- Perfil de usuario autenticado

**Protecciones de seguridad:**
- Rate limiting global (100 req/60s) y por endpoint (auth: 5-10/min, chat: 20/min)
- CSRF con patron de doble-submit cookie
- Helmet (headers de seguridad: CSP, X-Frame-Options: DENY, etc.)
- Validacion de entrada con Zod y class-validator
- Verificacion de MIME type + magic bytes en uploads
- Guard de prompt injection (20+ patrones regex + deteccion SQL injection)

### 2. Productos y categorias

**Productos (CRUD):**
- Listado publico con filtros (busqueda, categoria, ordenamiento por precio, paginacion, ofertas)
- Detalle de producto por ID o slug, incluye 8 productos similares de la misma categoria
- Crear/actualizar/eliminar (solo admin)

**Categorias (CRUD):**
- Listado publico
- Crear/actualizar/eliminar (solo admin)

### 3. Carrito de compras

- Agregar items al carrito (requiere JWT)
- Obtener carrito del usuario
- Eliminar items del carrito
- Carrito de invitado (localStorage con broadcasting de eventos)

### 4. Pedidos y checkout

- Checkout con clave de idempotencia
- Validacion y decremento de stock
- Vaciado del carrito post-compra
- Estados de pedido con transiciones validas (PENDING -> PAID -> SHIPPED -> DELIVERED, CANCELLED desde la mayoria)
- Cancelacion restaura stock automaticamente
- Historial de pedidos del cliente (paginado)
- Gestion de pedidos por admin (listado global, actualizacion de estado)
- Integracion con Dropi para creacion de ordenes de envio

### 5. Dashboard de administracion

- Estadisticas: ingresos diarios/mensuales/totales
- Conteo total de pedidos y pedidos pendientes
- Total de usuarios
- Top 5 productos mas vendidos con ingresos
- 5 pedidos mas recientes
- Alertas de stock bajo
- Metricas con graficos de rendimiento (Recharts)
- Funnel de ventas

### 6. Chatbot con IA (KronioBot)

El modulo mas sofisticado del proyecto — un agente de ventas con IA.

**Capacidades:**
- **Google Gemini** (gemini-2.5-flash) como LLM principal via Vercel AI SDK
- **Tool calling** con 2 herramientas:
  - `consultarStockYPrecio` — Consulta stock y precio de productos en tiempo real
  - `rastrearPedidoDropi` — Rastrea estado de envio via Dropi
- **RAG (Retrieval-Augmented Generation):**
  - Embeddings con OpenAI text-embedding-3-small
  - Busqueda semantica con pgvector
  - Optimizacion de consultas via LLM
- **UI generativa** — Retorna componentes UI estructurados (carruseles de productos, actualizaciones de tracking) junto al texto
- **Maquina de estados de conversacion** — Trackea el recorrido del usuario (EXPLORING -> COMPARING -> INTENT_TO_BUY -> CHECKOUT_READY)
- **Guard de prompt injection** — Detecta y bloquea ataques de inyeccion
- **Sesiones de invitado** — Persistentes con hash de secreto
- **Fallback local** — Respuestas inteligentes basadas en keywords cuando no hay API key de IA configurada

**Transporte:**
- HTTP: `POST /chat/message`, `GET /chat/history`
- WebSocket: namespace `/chat` con streaming de respuestas

### 7. Integracion con Dropi

**Autenticacion y sesion:**
- Login automatico con 2FA (TOTP) y refresco de token cada 45 minutos
- Re-login y re-autenticacion forzada ante `401` o expiracion
- Token de la API oficial (`atkn_...` via `DROPI_API_TOKEN`) para endpoints que requieren acceso total

**Catalogo e importacion de productos:**
- Consulta de catalogo de Dropi (busqueda, filtros de verificados/favoritos)
- Importacion de productos de Dropi al catalogo local (crea categorias si no existen, mapea imagenes, stock)
- Resolucion automatica de proveedor y bodega por producto (`resolveDropshipperContext`): proveedor = owner del producto, bodega = la de `warehouse_product` con mayor stock
- Precio de venta por defecto = precio sugerido de Dropi (garantiza que el pedido pase la validacion de precio "minimo 80% del sugerido")
- Media completa (todas las imagenes + videos) via la API oficial cuando `DROPI_API_TOKEN` esta configurada; las URLs de imagen se guardan con el CDN real de CloudFront
- La pagina de detalle de producto muestra una galeria unificada de imagenes y videos (reproductor nativo para MP4, embed para YouTube/Vimeo)

**Creacion y cancelacion de pedidos:**
- Creacion de ordenes por producto como pedido real de Dropi (`POST api-v2.dropi.co/bff/orders`)
- Cotizacion de envio (`POST api-v2.dropi.co/bff/orders/quote`)
- Regla de precio validada antes de llamar a Dropi: si el precio de venta es menor al sugerido, se bloquea con mensaje claro
- **Cancelacion automatica sincronizada**: al cancelar un pedido desde el panel de administracion, se invoca `PUT api.dropi.co/api/orders/myorders/{id}` con `{status: "CANCELADO"}`. Si Dropi rechaza la cancelacion (orden ya despachada o con guia), la cancelacion local igual se completa y el motivo queda registrado en `OrderTracking.lastEvent`

**Seguimiento:**
- Endpoint de tracking de guias y estado de conexion
- Sincronizacion de stock y de ordenes

### 8. Upload de imagenes

- Soporte para JPEG, PNG, WebP, GIF
- Verificacion de magic bytes (previene spoofing de extensiones)
- Limite de 5MB por archivo
- Subida a Cloudinary (preferido) o AWS S3 (respaldo)
- Editor de imagenes en el frontend (react-easy-crop)

### 9. Servicio de email

Plantillas HTML para:
- Emails de recuperacion de contrasena
- Emails de codigo de verificacion
- Emails de confirmacion de pedido (factura detallada con tabla de productos y direccion de envio)
- Emails de actualizacion de estado de pedido
- Emails de notificacion al admin de nuevos pedidos
- Fallback a consola cuando SMTP no esta configurado

### 10. Configuracion de tienda

- Gestion del logo de la tienda (obtener, establecer, eliminar)

### 11. Gestión de usuarios (Admin)

- Listado de usuarios (paginado)
- Obtener usuario por ID
- Actualizar rol de usuario
- Eliminar usuario

---

## Estructura del proyecto

```
├── .github/workflows/ci.yml       # CI: prisma validate, build, test, lint
├── .env.example                    # Variables de entorno documentadas
├── Dockerfile                      # Build multi-etapa para la API
├── package.json                    # Configuracion raiz del monorepo
├── pnpm-workspace.yaml             # Definicion de workspaces
├── prisma.config.ts                # Configuracion de Prisma
│
├── prisma/
│   ├── schema.prisma               # 13 modelos, 4 enums
│   ├── seed.ts                     # 7 categorias, 20 productos de ejemplo
│   └── migrations/                 # 21 migraciones
│
├── api/                            # Backend NestJS
│   └── src/
│       ├── main.ts                 # Bootstrap con Swagger, CORS, Helmet
│       ├── app.module.ts           # 13 modulos feature
│       ├── prisma/                 # PrismaService + PrismaModule
│       ├── common/                 # Guards, filters, pipes, Redis, CSRF, schemas
│       └── modules/
│           ├── auth/               # JWT, Google OAuth, sesiones, lockout
│           ├── users/              # CRUD de usuarios (admin)
│           ├── products/           # CRUD de productos con busqueda/filtros/paginacion
│           ├── categories/         # CRUD de categorias
│           ├── cart/               # Carrito de compras
│           ├── orders/             # Checkout, gestion de pedidos, cancelacion sincronizada con Dropi
│           ├── dashboard/          # Estadisticas y analytics del admin
│           ├── chat/               # Controller + WebSocket gateway del chat
│           ├── ai/                 # Agente IA (Gemini, RAG, tools, guardrails)
│           ├── dropi/              # Integracion con Dropi dropshipping (login 2FA, catalogo, ordenes, tracking)
│           ├── dropi-integration/  # Puente WooCommerce (webhooks /wp-json/wc/v3) para pedidos de Dropi
│           ├── aveonline/          # Integracion con Aveonline (dropshipping API V3)
│           ├── uploads/            # Upload de imagenes (Cloudinary/S3)
│           ├── mail/               # Servicio de email (Nodemailer)
│           └── settings/           # Configuracion de tienda (logo)
│
├── apps/web/                       # Frontend Next.js
│   ├── app/
│   │   ├── layout.tsx              # Layout raiz (Navbar, Banner, StoreChat)
│   │   ├── page.tsx                # Homepage
│   │   ├── products/               # Listado, detalle [slug], busqueda
│   │   ├── cart/                   # Carrito de compras
│   │   ├── orders/                 # Historial de pedidos
│   │   ├── login/                  # Login
│   │   ├── register/               # Registro
│   │   ├── forgot-password/        # Recuperacion de contrasena
│   │   ├── reset-password/         # Restablecer contrasena
│   │   ├── auth/google/            # Callback de Google OAuth
│   │   ├── admin/                  # Panel de administracion
│   │   │   └── layout.tsx          # Layout admin con sidebar colapsable
│   │   ├── nosotros/               # Pagina "Nosotros"
│   │   ├── terminos/               # Terminos de servicio
│   │   ├── privacidad/             # Politica de privacidad
│   │   └── dropi/                  # Pagina de Dropi
│   ├── components/                 # Componentes UI + admin + chat widget
│   └── lib/                        # api.ts, auth.ts, admin.ts, cloudinary.ts, guest-cart.ts
│
├── docs/deployment/                # Documentacion de despliegue
└── scripts/                        # Scripts (placeholder)
```

---

## Paginas publicas

| Ruta | Descripcion |
|------|-------------|
| `/` | Homepage: hero con video, carrusel de productos recomendados, grilla de promos, mision/vision |
| `/products` | Listado de productos con filtrado por categoria |
| `/products/[slug]` | Detalle de producto con productos similares |
| `/products/search` | Busqueda de productos |
| `/cart` | Carrito de compras |
| `/login` | Inicio de sesion |
| `/register` | Registro |
| `/forgot-password` | Recuperacion de contrasena |
| `/reset-password` | Restablecer contrasena |
| `/auth/google/callback` | Callback de Google OAuth |
| `/orders` | Historial de pedidos del cliente |
| `/nosotros` | Pagina "Nosotros" |
| `/terminos` | Terminos de servicio |
| `/privacidad` | Politica de privacidad |
| `/dropi` | Pagina de integracion Dropi |

## Paginas de administracion

| Ruta | Descripcion |
|------|-------------|
| `/admin` | Dashboard con metricas, graficos, funnel de ventas, top productos, pedidos recientes |
| `/admin/products` | Gestion de productos |
| `/admin/products/new` | Crear producto |
| `/admin/products/edit/[id]` | Editar producto (con editor de imagenes) |
| `/admin/categories` | Gestion de categorias |
| `/admin/categories/new` | Crear categoria |
| `/admin/categories/edit/[id]` | Editar categoria |
| `/admin/users` | Gestion de usuarios |
| `/admin/orders` | Gestion de pedidos |
| `/admin/logo` | Gestion del logo de tienda |
| `/admin/security` | Configuracion de seguridad |
| `/admin/dropi` | Gestion de integracion Dropi |

---

## Variables de entorno

Ver `.env.example` para la lista completa. Las variables principales son:

| Variable | Descripcion |
|----------|-------------|
| `DATABASE_URL` | URL de conexion a PostgreSQL (Neon) |
| `DIRECT_URL` | URL directa para migraciones |
| `REDIS_URL` | URL de Redis (Upstash) |
| `JWT_SECRET` | Secreto para firmar JWT |
| `OPENAI_API_KEY` | API key de OpenAI (embeddings para RAG) |
| `CLOUDINARY_*` | Credenciales de Cloudinary |
| `AWS_*` | Credenciales de AWS S3 |
| `SMTP_*` | Configuracion de email SMTP |
| `GOOGLE_CLIENT_ID/SECRET` | Credenciales de Google OAuth |
| `FRONTEND_URL` | URL del frontend (para links de email) |

---

## Scripts

| Comando | Descripcion |
|---------|-------------|
| `pnpm install` | Instalar dependencias del monorepo |
| `pnpm dev:api` | Iniciar API NestJS en puerto 3001 |
| `pnpm dev:web` | Iniciar Next.js en puerto 3000 |
| `pnpm build` | Compilar API y web |
| `pnpm test` | Ejecutar tests de la API |
| `pnpm lint` | Ejecutar linter del frontend |
| `pnpm prisma migrate dev` | Ejecutar migraciones de Prisma |
| `pnpm prisma db seed` | Poblar base de datos con datos de ejemplo |

---

## Despliegue

- **Frontend**: Vercel (directorio raiz `apps/web`)
- **API**: Servicio Node.js persistente (Docker o Render) — maneja Socket.IO, Dropi y workers
- **Base de datos**: Neon PostgreSQL (con extension `vector` habilitada)
- **Cache**: Upstash Redis (TLS)
- **Proxy de API**: Vercel rewrite `/api/proxy/*` -> API service
- **CI/CD**: GitHub Actions (prisma validate, build, test, lint en push a main y PRs)

Documentacion detallada de despliegue en `docs/deployment/vercel-neon.md`.

---

## Licencia

ISC
