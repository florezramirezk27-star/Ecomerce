/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { items: { include: { product: true } }, tracking: true },
  });

  for (const o of orders) {
    if (o.tracking?.status !== 'ERROR') continue;
    console.log('==================================================');
    console.log(`orderId=${o.id} numericId=${o.numericId} at=${o.createdAt.toISOString()}`);
    console.log(`  name: ${o.shippingName}`);
    console.log(`  phone: ${o.shippingPhone}`);
    console.log(`  email: ${o.shippingEmail}`);
    console.log(`  address: ${o.shippingAddress}`);
    console.log(`  city: ${o.shippingCity}`);
    console.log(`  state: ${o.shippingState}`);
    console.log(`  zip: ${o.shippingZip}`);
    console.log(`  notes: ${o.notes}`);
    for (const it of o.items) {
      console.log(
        `  item: dropiProductId=${it.product.dropiProductId} name="${it.product.name}" precio=${it.price} qty=${it.quantity} var=${it.variationId}`,
      );
    }
    console.log(`  rawResponse: ${JSON.stringify(o.tracking?.rawResponse).slice(0, 500)}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
