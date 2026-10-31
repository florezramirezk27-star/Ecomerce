# La API se construye con pnpm, que es el gestor real del monorepo.
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.5.0
WORKDIR /repo

# Copiar archivos de configuración del workspace (necesarios para pnpm install)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY api/package.json api/
COPY apps/web/package.json apps/web/

# Instalar dependencias. Sin --ignore-scripts para que se compilen
# dependencias nativas (bcrypt, etc.) correctamente.
RUN pnpm install --frozen-lockfile --filter=api... --filter=Ecommerce --ignore-scripts

# Generar el cliente Prisma ANTES del build de Nest, para que TypeScript
# tenga los tipos de PrismaService y las entidades (Product, User, Order, etc.)
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Copiar el codigo fuente de la API y construir
COPY api/tsconfig*.json api/nest-cli.json ./api/
COPY api/src ./api/src
RUN pnpm --filter=api run build

# Imagen de produccion: copiar todo lo necesario desde el stage de build.
# No usamos `pnpm deploy` porque no copia correctamente los archivos
# generados por `prisma generate` ni las dependencias del workspace root.
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# CLI de Prisma para las migraciones al arrancar
RUN npm install -g prisma@6

# Copiar todo desde el stage de build (package.json, dist, node_modules, schema)
COPY --from=build /repo/api/package.json ./package.json
COPY --from=build /repo/api/dist ./dist
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/prisma ./prisma

EXPOSE 3001
CMD ["sh", "-c", "prisma migrate deploy && node dist/main"]
