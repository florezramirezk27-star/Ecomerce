# La API se construye con pnpm, que es el gestor real del monorepo: el viejo
# `api/package-lock.json` de npm estaba abandonado y desincronizado con
# package.json, asi que `npm ci` fallaba en cada build de Railway.
FROM node:22-alpine AS build
RUN npm install -g pnpm@11.5.0
WORKDIR /repo

# El lockfile de pnpm cubre el workspace completo, asi que para instalar solo
# la API hacen falta los package.json de todos los importadores (aunque no su
# codigo). `prisma/` va antes del install porque `prisma generate` necesita el
# schema. `--ignore-scripts` evita que el postinstall de @prisma/client intente
# generar el cliente antes de que el schema este disponible.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY api/package.json api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter=api... --filter=Ecommerce --ignore-scripts

# Generar el cliente Prisma ANTES del build de Nest, para que TypeScript
# tenga los tipos de PrismaService y las entidades (Product, User, Order, etc.)
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

COPY api/tsconfig*.json api/nest-cli.json ./api/
COPY api/src ./api/src
RUN pnpm --filter=api run build

# /app queda autocontenida: package.json, dist y solo las dependencias de
# produccion, con archivos reales (sin symlinks al store del workspace). Es lo
# unico que pasa a la imagen de produccion. `--legacy` porque pnpm 10+ exige
# inject-workspace-packages para el deploy sin ese flag.
RUN pnpm --filter=api deploy --prod --legacy /app

WORKDIR /app
# El cliente Prisma ya esta generado dentro de node_modules/@prisma/client
# y viaja con pnpm deploy. No hace falta regenerar aqui.

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

# CLI de Prisma (misma mayoria que @prisma/client) para las migraciones al
# arrancar; el cliente en si ya viene generado desde la etapa build.
RUN npm install -g prisma@6

COPY --from=build /app ./

EXPOSE 3001
CMD ["sh", "-c", "prisma migrate deploy && node dist/main"]
