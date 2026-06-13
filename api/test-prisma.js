const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.$queryRaw`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
  .then(tables => { console.log('Tables:', tables.map(t => t.tablename).join(', ')); })
  .catch(e => console.error('Error:', e.message))
  .finally(() => p.$disconnect());
