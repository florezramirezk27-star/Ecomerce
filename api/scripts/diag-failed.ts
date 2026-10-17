/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { items: { include: { product: true } }, tracking: true },
  });

  for (const o of orders) {
    const status = o.tracking?.status ?? 'sin-tracking';
    const raw = o.tracking?.rawResponse
      ? JSON.stringify(o.tracking.rawResponse).slice(0, 160)
      : '';
    const local = o.items[0]?.product;
    console.log(
      `${o.createdAt.toISOString().slice(0, 16)} | ${o.status.padEnd(9)} | trk=${status.padEnd(
        18,
      )} | ${o.shippingState ?? '?'} / ${o.shippingCity ?? '?'} | dropiProduct=${
        local?.dropiProductId ?? '-'
      } | var=${
        o.items[0]?.variationId ?? 0
      } | precio=${o.items[0]?.price} | total=${o.total}`,
    );
    if (raw && /variado|rechazo|error|existencias/i.test(raw)) {
      console.log(`      raw: ${raw}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
