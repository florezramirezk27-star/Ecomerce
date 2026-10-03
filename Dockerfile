# Imagen del API para desplegar en un servicio Node persistente.
#
# Una sola etapa a proposito. Un multi-stage con `pnpm install --prod` en la
# imagen final era lo que montaba antes, y tiene un problema estructural: Prisma
# es un devDependency de la raiz del workspace, asi que una instalacion solo de
# produccion lo deja fuera y el `CMD` (`prisma migrate deploy`) revienta con
# "Cannot find module '/app/node_modules/prisma/build/index.js'". O se
# duplicaban capas copiando `.pnpm` a mano, o se acababa metiendo Prisma en la
# imagen final de cualquier modo. Una sola etapa evita las dos cosas y el
# servicio queda igual de pequeno, porque el tamano lo marca el node_modules de
# Linux, no el numero de capas.

FROM node:22-alpine

# `NODE_ENV=production` NO se fija aqui. pnpm lee esa variable al instalar y, si
# vale `production`, omite las devDependencies. Como Prisma esta declarado en las
# devDependencies de la raiz, se queda sin su binario y el build muere con
# "sh: prisma: not found". Se fija despues de compilar, en las ultimas capas.
WORKDIR /app

# Se usa pnpm, no npm: el monorepo se gestiona con pnpm (pnpm-workspace.yaml y
# pnpm-lock.yaml en la raiz, y CI instala con pnpm/action-setup). Antes esta
# imagen usaba `npm ci` con api/package-lock.json, un lockfile que nadie
# actualiza desde julio y que ya estaba desincronizado de package.json: `npm ci`
# falla si el lock y el manifiesto no coinciden, asi que cualquier dependencia
# nueva rompia el build aunque el proyecto cuadrase con pnpm.
RUN corepack enable

# Se copian primero los manifests y no el codigo, para que esta capa se reutilice
# mientras no cambien las dependencias. `apps/web/package.json` hace falta
# aunque no se instale, porque pertenece al workspace definido en
# pnpm-workspace.yaml y pnpm falla si un paquete del workspace no esta.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY api/package.json ./api/package.json
COPY apps/web/package.json ./apps/web/package.json

# Se instalan dosocos por separado porque pnpm solo admite un `--prod` para toda
# la invocacion, y aqui hacen falta dependencias de produccion y de desarrollo.
#
# El API (`api...`) va con `--prod`: en ejecucion solo hacen falta sus
# dependencias de produccion. Sus devDependencies (el CLI de Nest entre ellas)
# no se necesitan despues de compilar.
#
# La raiz del workspace va SIN `--prod` a proposito: Prisma esta declarado en sus
# devDependencies, y tanto `prisma generate` como `prisma migrate deploy` se
# ejecutan desde ahi. Con `--prod` el binario no se instala y el arranque revienta
# con "sh: prisma: not found".
#
# Instalacion completa del workspace, sin `--prod` y sin `--filter`.
#
# Al ser una imagen unica hay que compilar dentro, y compilar necesita las
# devDependencies: el CLI de Nest (api) y Prisma (raiz).
#
# Se instalo antes en dos pasos con `--filter .` y luego `--filter api... --prod`,
# y no funciona: la segunda pasada se lleva por delante la primera y deja la raiz
# sin `node_modules`, con lo que `prisma generate` falla con "sh: prisma: not
# found". Combinar `--filter . --filter api...` tampoco enlaza el binario de
# Prisma. Instalar el workspace entero es lo unico que enlaza correctamente los
# `.bin` de la raiz y de api, que es lo que necesitan `prisma` y `nest build`.
#
# El coste son las dependencias de apps/web, que no se despliegan desde aqui.
# Preferible a un build roto: si ese coste molesta, la via correcta es una
# imagen multi-stage con un `prisma` declarado como dependencia de produccion,
# no afinar los filtros.
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
COPY api ./api

# Prisma se configura desde la RAIZ del monorepo, no desde `api/`: ahi estan
# `prisma.config.ts` y el script `prisma:generate` del package.json raiz, y el
# schema se busca en `prisma/schema.prisma` relativo a la raiz. Invocarlo con
# `--dir api` hace que Prisma busque el schema en `api/prisma/`, que no existe, y
# el build falla con "schema.prisma: file not found".
RUN pnpm prisma:generate
RUN pnpm --dir api run build

# A partir de aqui ya no hace falta instalar nada mas, asi que `NODE_ENV` puede
# pasar a `production` sin afectar al build.
ENV NODE_ENV=production

EXPOSE 3001
# `migrate deploy` y no `dev` a proposito: en produccion solo se aplican las
# migraciones que ya existen en el repo, nunca se genera una nueva.
#
# Se llama por ruta y no por nombre: `node_modules/.bin` no esta en el PATH de
# `sh -c`, asi que un `prisma migrate deploy` a secas aborta con
# "sh: prisma: not found" aunque el binario este instalado. Invocarlo con
# `pnpm prisma:generate` tampoco vale aqui: ese script es de `generate`, no de
# `migrate`. Con la ruta se ejecutan las dos fases con el mismo binario.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node api/dist/main"]