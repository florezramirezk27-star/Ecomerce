import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  // Listar productos primero
  const products = await prisma.product.findMany({
    select: { id: true, name: true, active: true }
  });
  console.log('Productos antes de borrar:');
  console.log(products.map(p => ({ id: p.id, name: p.name, active: p.active })));
  
  // Borrar todos los productos
  await prisma.product.deleteMany({});
  console.log('Todos los productos borrados exitosamente');
  
  await prisma.$disconnect();
}
main().catch(e => {
  console.error('Error:', e);
  prisma.$disconnect();
  process.exit(1);
});