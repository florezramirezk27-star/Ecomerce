import { PrismaClient } from '@prisma/client';

// Force using the env variable
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_wy0j5ivsNOhE@ep-still-dawn-ay1fk55q-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

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
  // Paso 1: Borrar orderItems asociados a cada producto (excepto el objetivo)
  const otherProducts = products.filter(pr => pr.id !== target.id);
  console.log('\n=== Procesando', otherProducts.length, 'productos para borrar ===');
  
  for (const prod of otherProducts) {
    console.log('Procesando:', prod.name, '(id:', prod.id, ')');
    
    // Primero borrar orderItems que referencian este producto
    await prisma.orderItem.deleteMany({
      where: { productId: prod.id }
    });
    
    // Luego borrar el producto
    await prisma.product.delete({
      where: { id: prod.id }
    });
    
    console.log('  - OrderItems borrados');
    console.log('  - Producto borrado');
  }
  
  // Verificar qué quedó
  const remaining = await prisma.product.findMany({
    select: { id: true, name: true, active: true }
  });
  
  console.log('\n=== Productos restantes ===');
  remaining.forEach(pr => console.log(' -', pr.name, 'active:', pr.active));
  
  console.log('\n=== Operacion completada ===');
  console.log('Solo quedó el producto:', targetName);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error fatal:', e);
  prisma.$disconnect();
  process.exit(1);
});