import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding categories...');

  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Ropa y Moda',
        slug: 'ropa-y-moda',
        description: 'Camisetas, pantalones, chaquetas y más',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Electrónica',
        slug: 'electronica',
        description: 'Dispositivos y accesorios electrónicos',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Hogar y Decoración',
        slug: 'hogar-y-decoracion',
        description: 'Artículos para el hogar y decoración',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Deportes y Fitness',
        slug: 'deportes-y-fitness',
        description: 'Equipamiento deportivo y accesorios',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Juguetes y Entretenimiento',
        slug: 'juguetes-y-entretenimiento',
        description: 'Juguetes, juegos y diversión',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Accesorios',
        slug: 'accesorios',
        description: 'Relojes, gafas, joyería y complementos',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Belleza y Cuidado Personal',
        slug: 'belleza-y-cuidado',
        description: 'Cosméticos, perfumes y cuidado personal',
      },
    }),
  ]);

  console.log(`Created ${categories.length} categories`);

  const [ropa, electronica, hogar, deportes, juguetes, accesorios, belleza] = categories;

  console.log('Seeding products...');

  const productsData = [
    // Ropa y Moda (3)
    { name: 'Camiseta Oversize Algodón', slug: 'camiseta-oversize-algodon', description: 'Camiseta de algodón 100% con corte oversize, disponible en varios colores. Ideal para looks casuales y cómodos.', price: 45000, oldPrice: 65000, stock: 50, image: 'https://picsum.photos/seed/prod1/600/600', categoryId: ropa.id },
    { name: 'Chaqueta Impermeable Hombre', slug: 'chaqueta-impermeable-hombre', description: 'Chaqueta con membrana impermeable y transpirable. Capucha ajustable y bolsillos con cremallera.', price: 120000, stock: 30, image: 'https://picsum.photos/seed/prod2/600/600', categoryId: ropa.id },
    { name: 'Pantalón Jogger Premium', slug: 'pantalon-jogger-premium', description: 'Pantalón estilo jogger en algodón fleece de alta gramaje. Cintura elástica con ajuste de cordón.', price: 78000, stock: 40, image: 'https://picsum.photos/seed/prod3/600/600', categoryId: ropa.id },

    // Electrónica (3)
    { name: 'Auriculares Bluetooth Pro', slug: 'auriculares-bluetooth-pro', description: 'Auriculares inalámbricos con cancelación de ruido activa, 30h de batería y sonido envolvente.', price: 185000, oldPrice: 220000, stock: 25, image: 'https://picsum.photos/seed/prod4/600/600', categoryId: electronica.id },
    { name: 'Parlante Portátil Resistente', slug: 'parlante-portatil-resistente', description: 'Parlante Bluetooth a prueba de agua IP67. Sonido potente y 12h de reproducción continua.', price: 95000, stock: 35, image: 'https://picsum.photos/seed/prod5/600/600', categoryId: electronica.id },
    { name: 'Cargador Inalámbrico Rápido', slug: 'cargador-inalambrico-rapido', description: 'Base de carga rápida Qi para smartphones. Carga hasta 15W con protección contra sobrecalentamiento.', price: 35000, stock: 60, image: 'https://picsum.photos/seed/prod6/600/600', categoryId: electronica.id },

    // Hogar y Decoración (3)
    { name: 'Lámpara LED Escritorio', slug: 'lampara-led-escritorio', description: 'Lámpara de escritorio con brazo ajustable y luz LED regulable. Temperatura de color 3000K-6000K.', price: 62000, stock: 20, image: 'https://picsum.photos/seed/prod7/600/600', categoryId: hogar.id },
    { name: 'Set de Velas Aromáticas', slug: 'set-velas-aromaticas', description: 'Set de 3 velas artesanales con aromas naturales. Vainilla, lavanda y canela. Queman hasta 40h c/u.', price: 28000, stock: 45, image: 'https://picsum.photos/seed/prod8/600/600', categoryId: hogar.id },
    { name: 'Organizador Multiusos', slug: 'organizador-multiusos', description: 'Organizador de escritorio de bambú natural con 6 compartimentos ideal para oficina o estudio.', price: 42000, oldPrice: 55000, stock: 55, image: 'https://picsum.photos/seed/prod9/600/600', categoryId: hogar.id },

    // Deportes y Fitness (3)
    { name: 'Botella Deportiva 1L', slug: 'botella-deportiva-1l', description: 'Botella térmica de acero inoxidable, mantiene bebidas frías 24h o calientes 12h. Tapa hermética.', price: 38000, stock: 70, image: 'https://picsum.photos/seed/prod10/600/600', categoryId: deportes.id },
    { name: 'Esterilla Yoga Premium', slug: 'esterilla-yoga-premium', description: 'Esterilla antideslizante de 6mm con alineación guiada. Incluye bolsa de transporte.', price: 55000, stock: 30, image: 'https://picsum.photos/seed/prod11/600/600', categoryId: deportes.id },
    { name: 'Kit Pesas Rusa 10kg', slug: 'kit-pesas-rusa-10kg', description: 'Pesa rusa de hierro fundido con agarre ergonómico. Ideal para entrenamiento funcional y crossfit.', price: 75000, oldPrice: 90000, stock: 15, image: 'https://picsum.photos/seed/prod12/600/600', categoryId: deportes.id },

    // Juguetes y Entretenimiento (3)
    { name: 'Rompecabezas 1000 Piezas', slug: 'rompecabezas-1000-piezas', description: 'Rompecabezas de alta calidad con ilustración de paisaje urbano. Piezas precisas y resistentes.', price: 32000, stock: 40, image: 'https://picsum.photos/seed/prod13/600/600', categoryId: juguetes.id },
    { name: 'Juego Construcción 200pz', slug: 'juego-construccion-200pz', description: 'Set de bloques de construcción compatibles con marcas líderes. Incluye piezas de colores y figuras.', price: 48000, stock: 35, image: 'https://picsum.photos/seed/prod14/600/600', categoryId: juguetes.id },
    { name: 'Drone Plegable Cámara HD', slug: 'drone-plegable-camara-hd', description: 'Drone compacto con cámara 1080p, estabilización y modos de vuelo inteligentes.', price: 145000, oldPrice: 180000, stock: 10, image: 'https://picsum.photos/seed/prod15/600/600', categoryId: juguetes.id },

    // Accesorios (3)
    { name: 'Reloj Deportivo Digital', slug: 'reloj-deportivo-digital', description: 'Reloj con pantalla LCD, cronómetro, alarma y resistencia al agua. Correa de silicona ajustable.', price: 52000, stock: 50, image: 'https://picsum.photos/seed/prod16/600/600', categoryId: accesorios.id },
    { name: 'Mochila Urbana 20L', slug: 'mochila-urbana-20l', description: 'Mochila impermeable con compartimiento para laptop de 15.6". Bolsillos organizadores y puerto USB.', price: 68000, stock: 30, image: 'https://picsum.photos/seed/prod17/600/600', categoryId: accesorios.id },
    { name: 'Gafas de Sol Polarizadas', slug: 'gafas-sol-polarizadas', description: 'Gafas de sol con lentes polarizadas que bloquean 99% UV. Diseño clásico y resistente.', price: 44000, stock: 45, image: 'https://picsum.photos/seed/prod18/600/600', categoryId: accesorios.id },

    // Belleza y Cuidado Personal (2)
    { name: 'Perfume Esencia Natural 50ml', slug: 'perfume-esencia-natural-50ml', description: 'Perfume unisex con notas cítricas y amaderadas. Fragancia duradera y envase elegante.', price: 89000, oldPrice: 110000, stock: 25, image: 'https://picsum.photos/seed/prod19/600/600', categoryId: belleza.id },
    { name: 'Set Brochas Maquillaje', slug: 'set-brochas-maquillaje', description: 'Set profesional de 12 brochas con cerdas sintéticas suaves. Incluye estuche organizador.', price: 35000, stock: 40, image: 'https://picsum.photos/seed/prod20/600/600', categoryId: belleza.id },
  ];

  for (const data of productsData) {
    await prisma.product.create({ data });
  }

  console.log(`Created ${productsData.length} products`);
  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
