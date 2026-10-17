/* eslint-disable no-console */
/**
 * Historial de pedidos con su resultado en Dropi, en orden cronologico.
 * Read-only. Se corre con:
 *   npx ts-node --transpile-only scripts/diag-history.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const short = (v: unknown, max = 140): string => {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}...` : t;
};

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'asc' },
    include: { items: { include: { product: true } }, tracking: true },
  });

  console.log(`total pedidos: ${orders.length}\n`);
  for (const o of orders) {
    const items = o.items
      .map((i) => `${i.product?.name ?? i.productId} x${i.quantity}`)
      .join(' + ');
    console.log(
      `${o.createdAt.toISOString()} [${o.status}] $${Number(o.total)} | ${
        o.tracking?.status ?? '-'
      } | dropiId=${o.tracking?.dropiOrderId ?? '-'} | ${short(items, 90)}`,
    );
    const ev = o.tracking?.lastEvent ?? '';
    if (ev && !/creado|cread|exito|success/i.test(String(ev))) {
      console.log(`     -> ${short(ev, 160)}`);
    }
  }

  console.log('\n== resumen por estado de tracking ==');
  const byStatus = new Map<string, number>();
  for (const o of orders) {
    const k = o.tracking?.status ?? '(sin tracking)';
    byStatus.set(k, (byStatus.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...byStatus.entries()].sort()) console.log(`  ${k}: ${v}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
