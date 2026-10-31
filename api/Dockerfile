# La API se construye con pnpm, que es el gestor real del monorepo.
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.5.0
WORKDIR /repo

# Copiar archivos de configuración del workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY api/package.json api/
COPY apps/web/package.json apps/web/

# Instalar dependencias. --ignore-scripts evita que el postinstall de
# @prisma/client intente generar el cliente antes de que el schema este
# disponible (se genera explicitamente en el siguiente paso).
RUN pnpm install --frozen-lockfile --filter=api... --filter=Ecommerce --ignore-scripts

# Generar el cliente Prisma ANTES del build de Nest, para que TypeScript
# tenga los tipos durante la compilacion.
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Copiar el codigo fuente de la API y construir
COPY api/tsconfig*.json api/nest-cli.json ./api/
COPY api/src ./api/src
RUN pnpm --filter=api run build

# Imagen de produccion: copiar todo desde el build stage.
# Copiar node_modules completo (Docker resuelve symlinks a archivos reales),
# el dist de la API, el schema de Prisma y el cliente Prisma generado.
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# CLI de Prisma para las migraciones al arrancar
RUN npm install -g prisma@6

# Copiar todo desde el stage de build
COPY --from=build /repo/api/package.json ./package.json
COPY --from=build /repo/api/dist ./dist
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/prisma ./prisma

# Regenerar el cliente Prisma en produccion por seguridad (por si acaso
# el copy no trajo los archivos .prisma/client generados).
RUN /app/node_modules/.bin/prisma generate --schema=prisma/schema.prisma

EXPOSE 3001
CMD ["sh", "-c", "prisma migrate deploy && node dist/main"]
