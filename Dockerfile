FROM node:22-alpine AS build
WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig*.json api/nest-cli.json ./
COPY prisma ./prisma
COPY api/src ./src
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
