# ==========================================
# ETAPA 1: CONSTRUCCIÓN
# ==========================================
FROM node:22-alpine AS build

RUN npm install -g pnpm@11.5.0

WORKDIR /repo

# Archivos del monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY api/package.json ./api/package.json
COPY apps/web/package.json ./apps/web/package.json

# Instalar dependencias del API y de la raíz
RUN pnpm install --frozen-lockfile --filter=api... --filter=Ecommerce --ignore-scripts

# Generar Prisma Client
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Copiar código fuente
COPY api/tsconfig*.json api/nest-cli.json ./api/
COPY api/src ./api/src

# Compilar NestJS
RUN pnpm --filter=api run build

# Verificar que NestJS está instalado
RUN node -e "console.log('NestJS:', require.resolve('@nestjs/core', { paths: ['/repo/api'] }))"


# ==========================================
# ETAPA 2: PRODUCCIÓN
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copiar manifiesto y compilación del API,
# conservando la estructura original del workspace.
COPY --from=build /repo/api/package.json ./api/package.json
COPY --from=build /repo/api/dist ./api/dist

# IMPORTANTE:
# Copiar las dependencias propias del API.
COPY --from=build /repo/api/node_modules ./api/node_modules

# Copiar el node_modules raíz, que contiene
# el almacén .pnpm al que apuntan los enlaces.
COPY --from=build /repo/node_modules ./node_modules

# Copiar esquema y migraciones de Prisma
COPY --from=build /repo/prisma ./prisma

# Generar/verificar Prisma Client en producción
RUN ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma

# Verificar que NestJS también está disponible en producción
RUN node -e "console.log('NestJS producción:', require.resolve('@nestjs/core', { paths: ['/app/api'] }))"

EXPOSE 3001

# Migraciones existentes y arranque de NestJS
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma && node api/dist/main"]
