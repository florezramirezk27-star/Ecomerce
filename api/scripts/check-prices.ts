/* eslint-disable no-console */
/**
 * Para cada producto importado, compara el precio local con el sugerido de
 * Dropi (regla: `dropi.orders.ts` rechaza la orden si precio < sugerido).
 * Solo lectura: consulta la BD y el /dropi/catalog de produccion.
 */
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
      {
        hostname: API_HOST,
        path,
        method: 'GET',
        timeout: 60000,
        headers: { Authorization: `Bearer ${token}` },
      },
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

interface DropiRawProduct {
  suggested_price?: number | string | null;
  sale_price?: number | string | null;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const session = await prisma.session.findFirst({
    where: { userId: admin!.id, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  const token = sign({
    sub: admin!.id,
    email: admin!.email,
    role: admin!.role,
    sessionId: session!.id,
  });

  const products = await prisma.product.findMany({
    where: { dropiProductId: { not: null } },
    select: { name: true, price: true, dropiProductId: true },
    orderBy: { name: 'asc' },
  });

  console.log('dropiId\tlocal\tsugerido\testado\tproducto');
  for (const p of products) {
    let suggested = 0;
    try {
      const raw = await get(`/dropi/catalog?search=${p.dropiProductId}`, token);
      const parsed = JSON.parse(raw) as { objects?: DropiRawProduct[] };
      const obj = parsed.objects?.[0];
      suggested = Number(obj?.suggested_price) || 0;
    } catch {
      suggested = -1;
    }
    const local = Number(p.price);
    const gate = suggested > 0 && local < suggested;
    const estado =
      suggested < 0 ? 'ERR' : gate ? 'RECHAZA (precio < sugerido)' : 'OK';
    console.log(
      `${p.dropiProductId}\t${local}\t${suggested}\t${estado}\t${p.name}`,
    );
  }
}

main()
  .catch((e) => {
    console.error('ERR', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
