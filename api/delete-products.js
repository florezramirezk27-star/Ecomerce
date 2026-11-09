const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, active: true }
  });
  console.log('Productos en BD:', products.map(p => ({ id: p.id, name: p.name, active: p.active })));
  
  // Borrar todos los productos
  await prisma.product.deleteMany({});
  console.log('Todos los productos borrados');
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});