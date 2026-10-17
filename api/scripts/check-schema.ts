/* eslint-disable no-console */
/** Revisa si las columnas de variaciones ya existen en la BD (solo lectura). */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const cols = await prisma.$queryRaw<
    Array<{ table_name: string; column_name: string; data_type: string }>
  >`SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_name IN ('Product','CartItem','OrderItem')
      AND column_name IN ('variations','variationId','variationName')
    ORDER BY table_name, column_name`;
  console.log('columnas de variaciones:', JSON.stringify(cols, null, 2));

  const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes WHERE tablename = 'CartItem' ORDER BY indexname`;
  console.log('indices de CartItem:', JSON.stringify(idx, null, 2));

  const mig = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 6`;
  console.log('ultimas migraciones:', JSON.stringify(mig, null, 2));
}

main()
  .catch((e) => {
    console.error('ERR', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
