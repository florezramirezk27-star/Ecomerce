import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Listar todos los productos
  const products = await prisma.product.findMany({
    select: { id: true, name: true, active: true }
  });
  
  console.log('=== Productos actuales en BD ===');
  products.forEach(pr => console.log(' -', pr.name, 'active:', pr.active));
  
  // Encontrar el producto a preservar
  const targetName = 'GOTAS OFTALMIEL ADIÓS CATARATAS';
  const target = products.find(pr => pr.name === targetName);
  
  if (!target) {
    console.error('No se encontro el producto:', targetName);
    await prisma.$disconnect();
    return;
  }
  
  console.log('\n=== Producto a preservar ===');
  console.log(' -', target.name, '(id:', target.id, ')');
  
  // Borrar todos menos el objetivo
  const deleteIds = products
    .filter(pr => pr.id !== target.id)
    .map(pr => pr.id);
  
  console.log('\n=== Borrando', deleteIds.length, 'productos ===');
  await prisma.product.deleteMany({
    where: {
      id: {
        in: deleteIds
      }
    }
  });
  
  // Verificar qué quedó
  const remaining = await prisma.product.findMany({
    select: { id: true, name: true, active: true }
  });
  
  console.log('\n=== Productos restantes ===');
  remaining.forEach(pr => console.log(' -', pr.name, 'active:', pr.active));
  
  console.log('\n=== Operacion completada ===');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error fatal:', e);
  prisma.$disconnect();
  process.exit(1);
});