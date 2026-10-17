/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      password: true,
      createdAt: true,
      _count: { select: { sessions: true } },
    },
  });
  console.log(`usuarios: ${users.length}`);
  for (const u of users) {
    console.log(
      `${u.createdAt.toISOString().slice(0, 10)} | ${u.role.padEnd(6)} | ${
        u.email
      } | pw=${u.password ? 'si' : 'NO'} | sessions=${u._count.sessions} | ${
        u.name ?? ''
      }`,
    );
  }

  const sessions = await prisma.session.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
    take: 10,
    include: { user: { select: { email: true, role: true } } },
  });
  console.log(`\nsesiones vivas: ${sessions.length}`);
  for (const s of sessions) {
    console.log(
      `  ${s.user.email} (${s.user.role}) expira ${s.expiresAt.toISOString()}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
