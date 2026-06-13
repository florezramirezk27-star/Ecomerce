const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'admin@kronio.com' } });
  if (!user) { console.log('User not found'); return; }
  console.log('User:', user.id, user.email, user.role);

  const session = await prisma.session.findFirst({ where: { userId: user.id } });
  if (session) {
    console.log('Session:', session.id, session.expiresAt, new Date() < session.expiresAt ? 'valid' : 'expired');
  } else {
    console.log('No session found');
  }

  console.log('JWT_SECRET from env:', process.env.JWT_SECRET ? process.env.JWT_SECRET.substring(0, 10) + '...' : 'NOT SET');
}

main().catch(e => console.error('Error:', e)).finally(() => prisma.$disconnect());
