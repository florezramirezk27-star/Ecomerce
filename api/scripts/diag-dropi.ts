/* eslint-disable no-console */
/**
 * Diagnostico read-only de la integracion con Dropi.
 *
 * Se conecta a la base de datos (usa DATABASE_URL) y saca:
 *  - los ultimos pedidos con productos de proveedor y el tracking de Dropi,
 *  - el motivo crudo que devolvio Dropi (rawResponse),
 *  - el catalogo local de productos con `dropiProductId` (stock, variaciones).
 *
 * No escribe nada. Se corre con:
 *   npx ts-node --transpile-only scripts/diag-dropi.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
  log: ['warn', 'error'],
});

function short(value: unknown, max = 600): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function main() {
  console.log('\n== PEDIDOS RECIENTES ==');
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: {
      items: { include: { product: true } },
      tracking: true,
    },
  });

  if (orders.length === 0) {
    console.log('(sin pedidos)');
  }

  for (const order of orders) {
    const dropiItems = order.items.filter((i) => i.product?.dropiProductId);
    const trk = order.tracking;
    console.log(
      `\n#${order.id} ${order.createdAt.toISOString()} [${order.status}] total=${Number(order.total)}`,
    );
    console.log(
      `   tracking: dropiOrderId=${trk?.dropiOrderId ?? '-'} status=${trk?.status ?? '-'}`,
    );
    console.log(`   lastEvent: ${short(trk?.lastEvent ?? '-')}`);
    if (trk?.rawResponse) {
      console.log(`   rawResponse: ${short(trk.rawResponse, 1200)}`);
    }
    for (const item of order.items) {
      console.log(
        `   item: ${item.product?.name ?? item.productId} | dropiId=${
          item.product?.dropiProductId ?? '-'
        } | qty=${item.quantity} | var=${item.variationId} "${
          item.variationName ?? ''
        }" | precio=${Number(item.price)}`,
      );
    }
    if (dropiItems.length === 0) {
      console.log('   (sin productos de proveedor)');
    }
  }

  console.log('\n\n== PRODUCTOS CON dropiProductId ==');
  const products = await prisma.product.findMany({
    where: { dropiProductId: { not: null } },
    orderBy: { updatedAt: 'desc' },
    include: { category: { select: { name: true } } },
  });
  console.log(`total: ${products.length}`);
  for (const p of products) {
    const variations = Array.isArray(p.variations) ? (p.variations as any[]) : [];
    const varText =
      variations.length > 0
        ? variations
            .map((v) => `#${v?.id}=${v?.stock}${v?.name ? `(${v.name})` : ''}`)
            .join(', ')
        : '-';
    console.log(
      `   [${p.active ? 'ON ' : 'OFF'}] dropiId=${p.dropiProductId} stock=${p.stock} precio=${Number(
        p.price,
      )} old=${p.oldPrice != null ? Number(p.oldPrice) : '-'} cat=${p.category?.name ?? '-'} | ${
        p.name
      }`,
    );
    console.log(`         variations: ${varText}`);
  }
}

main()
  .catch((err) => {
    console.error('DIAG ERROR:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
