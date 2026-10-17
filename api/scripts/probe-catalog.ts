/* eslint-disable no-console */
/** Imprime la respuesta CRUDA de /dropi/catalog para un id, tal como la ve la app. */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import https from 'https';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const API_HOST = 'ecomerce-vslf.onrender.com';
const SECRET = '5b7018dbf2cec11be1a9569114a20063d50e19fcdd898cd2672bd910bf0dc05c';

function b64(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
function sign(payload: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(
    JSON.stringify({ ...payload, iat: now, exp: now + 900 }),
  )}`;
  return `${data}.${b64(crypto.createHmac('sha256', SECRET).update(data).digest())}`;
}
function get(path: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = https.request(
      { hostname: API_HOST, path, method: 'GET', timeout: 60000, headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => resolve(out));
      },
    );
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    r.end();
  });
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const session = await prisma.session.findFirst({
    where: { userId: admin!.id, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  const token = sign({ sub: admin!.id, email: admin!.email, role: admin!.role, sessionId: session!.id });

  const raw = await get('/dropi/catalog?search=2160787', token);
  console.log('RAW /dropi/catalog?search=2160787:');
  console.log(raw.slice(0, 700));

  const list = await get('/dropi/catalog', token);
  console.log('\nRAW /dropi/catalog (lista, primeras claves):');
  console.log(list.slice(0, 260));
  try {
    const j = JSON.parse(list) as { isSuccess?: boolean; message?: string };
    console.log(
      `\nisSuccess=${j.isSuccess} message=${j.message} (claves de nivel raiz: ${Object.keys(j).join(',')})`,
    );
  } catch {
    console.log('(no parseable)');
  }
}

main()
  .catch((e) => {
    console.error('ERR', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
