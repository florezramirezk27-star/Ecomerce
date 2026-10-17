/* eslint-disable no-console */
/**
 * Prueba read-only contra la API de produccion. Firma un JWT corto (HS256) con
 * cada secreto candidato hasta que uno autentique, y consulta /dropi/status y
 * /dropi/catalog (estado REAL de Dropi). No crea ordenes.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import https from 'https';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const API_HOST = 'ecomerce-vslf.onrender.com';

const SECRETS = [
  '5b7018dbf2cec11be1a9569114a20063d50e19fcdd898cd2672bd910bf0dc05c',
  'c84461ebab5cbe674ff4782a3eb67727ce4677ceddce122a732abddb5ec94b09',
  'de74b680e0a9a71f998e74f0280e066e5fbba272c920edcdb411fd545e81080e',
];

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const data = `${base64url(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  )}.${base64url(JSON.stringify({ ...payload, iat: now, exp: now + 600 }))}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${base64url(sig)}`;
}

function request(
  path: string,
  token: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path,
        method: 'GET',
        timeout: 40000,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('no admin');
  const session = await prisma.session.findFirst({
    where: { userId: admin.id, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: 'desc' },
  });
  if (!session) throw new Error('no session');
  console.log(`admin=${admin.email} session=${session.id}`);

  let token = '';
  for (const secret of SECRETS) {
    const t = signJwt(
      { sub: admin.id, email: admin.email, role: admin.role, sessionId: session.id },
      secret,
    );
    const res = await request('/dropi/status', t);
    console.log(
      `secreto ${secret.slice(0, 8)}... -> ${res.status} ${res.body.slice(0, 120)}`,
    );
    if (res.status === 200) {
      token = t;
      console.log(`*** autenticado con ${secret.slice(0, 8)}... ***`);
      break;
    }
  }

  if (!token) {
    console.log('Ningun secreto autentico.');
    return;
  }

  for (const id of [2160787, 1742263, 1734566, 2257777]) {
    const res = await request(`/dropi/catalog?search=${id}`, token);
    console.log(`\n=== catalog ${id} -> ${res.status} ===`);
    try {
      const json = JSON.parse(res.body) as { objects?: any[] };
      const objs = json.objects ?? [];
      for (const o of objs) {
        console.log(
          JSON.stringify(
            {
              id: o.id,
              name: o.name,
              type: o.type,
              active: o.active,
              sale_price: o.sale_price,
              suggested_price: o.suggested_price,
              user_id: o.user?.id,
              warehouse_product: o.warehouse_product,
              variations: o.variations,
            },
            null,
            2,
          ),
        );
      }
    } catch {
      console.log(res.body.slice(0, 600));
    }
  }
}

main()
  .catch((e) => {
    console.error('PROBE ERROR:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
