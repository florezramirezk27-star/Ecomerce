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

# /app queda autocontenida: package.json, dist y solo las dependencias de
# produccion, con archivos reales (sin symlinks al store del workspace).
RUN pnpm --filter=api deploy --prod --legacy /app

WORKDIR /app
# El cliente Prisma ya fue generado y viaja con pnpm deploy.
# Copiar el schema para las migraciones al arrancar.
COPY prisma ./prisma

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# CLI de Prisma para las migraciones al arrancar
RUN npm install -g prisma@6

COPY --from=build /app ./

EXPOSE 3001
CMD ["sh", "-c", "prisma migrate deploy && node dist/main"]
