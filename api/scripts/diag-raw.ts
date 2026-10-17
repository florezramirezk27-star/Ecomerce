/* eslint-disable no-console */
/**
 * Vuelca el rawResponse completo de ordenes concretas (exitosas y fallidas)
 * para comparar que aceptaba Dropi antes y que rechaza ahora.
 * Read-only. Uso: npx ts-node --transpile-only scripts/diag-raw.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      tracking: { isNot: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 14,
    include: { items: { include: { product: true } }, tracking: true },
  });

  for (const o of orders) {
    console.log('\n' + '='.repeat(80));
    console.log(
      `#${o.id} ${o.createdAt.toISOString()} [${o.status}] $${Number(
        o.total,
      )} tracking=${o.tracking?.status}`,
    );
    console.log(
      'items: ' +
        o.items.map((i) => `${i.product?.name} (dropiId=${i.product?.dropiProductId})`).join(' + '),
    );
    console.log('lastEvent: ' + (o.tracking?.lastEvent ?? '-'));
    console.log('rawResponse:');
    const raw = o.tracking?.rawResponse;
    const asObj = typeof raw === 'string' ? safeParse(raw) : raw;
    console.log(JSON.stringify(asObj, null, 2));
  }

  console.log('\n\n== PRODUCTOS (columnas crudas) ==');
  const products = await prisma.product.findMany({
    where: { dropiProductId: { not: null } },
    include: { category: true },
  });
  for (const p of products) {
    console.log('\n' + '-'.repeat(70));
    console.log(`name: ${p.name}`);
    console.log(
      `dropiProductId=${p.dropiProductId} active=${p.active} stock=${p.stock} price=${p.price} oldPrice=${p.oldPrice} cat=${p.category?.name}`,
    );
    console.log(`variations: ${JSON.stringify(p.variations)}`);
    console.log(`description: ${(p.description ?? '').slice(0, 400)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
