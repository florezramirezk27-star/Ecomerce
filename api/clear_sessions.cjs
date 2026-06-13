const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$executeRawUnsafe('UPDATE "User" SET "sessionId" = NULL, "sessionExpiresAt" = NULL')
  .then(r => console.log('Updated rows:', r))
  .then(() => prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, sessionId: true } }))
  .then(r => r.forEach(u => console.log(u.email, 'sessionId:', u.sessionId ? 'SET' : 'null')))
  .then(() => prisma.$disconnect())
  .catch(e => console.error(e));
