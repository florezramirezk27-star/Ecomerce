/* eslint-disable no-console */
/**
 * Reproduce en produccion la creacion de orden Dropi con el token admin.
 *
 * Modos (argumentos):
 *   quote   -> hace la cotizacion antes de la orden (comportamiento actual de mi prueba)
 *   noquote -> NO cotiza, manda la orden directo (comportamiento actual de la app)
 *   order   -> crea la orden (sin esto solo cotiza)
 *
 * Reenvia el payload EXACTO de la ultima orden que fallo en produccion
 * (order numericId=55): VITAMIN B12 2160787, Bucaramanga/Santander, precio 59900.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import https from 'https';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const API_HOST = 'ecomerce-vslf.onrender.com';
const SECRET = '5b7018dbf2cec11be1a9569114a20063d50e19fcdd898cd2672bd910bf0dc05c';
const CSRF = 'a'.repeat(64);

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

function req(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ status: number; body: string }> {
  const data = body === undefined ? '' : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: API_HOST,
        path,
        method,
        timeout: 60000,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-csrf-token': CSRF,
          Cookie: `__Host-csrf-token=${CSRF}`,
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: out }));
      },
    );
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const doQuote = args.includes('quote');
  const noQuote = args.includes('noquote');
  const doOrder = args.includes('order');
  const doReprocess = args.includes('reprocess');
  const useDefaults = args.includes('wrong');

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

  if (doReprocess) {
    const order = await prisma.order.findFirst({
      where: { tracking: { is: { status: 'ERROR' } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new Error('no hay orden en ERROR');
    console.log(
      `----- REPROCESS ${order.id} (numericId=${order.numericId}) via el MISMO codigo de la app -----`,
    );
    const r = await req(
      'POST',
      `/orders/${order.id}/reprocess?force=true`,
      token,
    );
    console.log(`status=${r.status}`);
    console.log(r.body.slice(0, 1500));
    return;
  }

  // Payload EXACTO de la orden numericId=55 (la ultima que fallo).
  const orderBody = {
    total_order: 59900,
    notes: 'Vsvdhe',
    name: 'kevin',
    surname: '',
    dir: 'Cadjdjdj',
    city: 'Bucaramanga',
    client_email: 'florezramirezk.27@gmail.com',
    colonia: '',
    country: 'COLOMBIA',
    distributionCompany: {
      id: 3,
      name: useDefaults ? 'Dropi' : 'INTERRAPIDISIMO',
    },
    dni: '',
    dni_type: '',
    insurance: false,
    payment_method_id: 1,
    phone: '3197808469',
    products: [{ id: 2160787, variation_id: null, quantity: 1, price: 59900 }],
    rate_type: 'CON RECAUDO',
    shalom_data: null,
    shipping_amount: 41295,
    shop_id: null,
    state: 'SANTANDER',
    supplier_id: useDefaults ? 29151 : 156110,
    type: 'FINAL_ORDER',
    type_service: 'normal',
    user_id: 660824,
    warehouses_selected_id: useDefaults ? 3577 : 10913,
    zip_code: '680001',
  };

  if (doQuote) {
    console.log('----- COTIZACION (quote) -----');
    const quoteBody = {
      products: [{ id: 2160787, variation_id: null, quantity: 1, price: 59900 }],
      ciudad_destino: { id: 50, name: 'BUCARAMANGA' },
      ciudad_remitente: { id: 329, name: 'BUCARAMANGA' },
      EnvioConCobro: true,
      ValorDeclarado: 59900,
      dir: 'Cadjdjdj',
      destination_name: 'kevin',
      destination_phone: '3197808469',
      zip_code: '680001',
      colonia: null,
      peso: 1,
      largo: 10,
      ancho: 10,
      alto: 10,
      warehouse: { id: 10913, city_id: 329, user_id: 156110 },
    };
    const q = await req('POST', '/dropi/orders/quote', token, quoteBody);
    console.log(`status=${q.status} ${q.body.slice(0, 400)}`);
  } else if (noQuote) {
    console.log('(sin cotizar primero, igual que la app)');
  }

  if (!doOrder) {
    console.log('(solo cotizacion; corre con "order" para crear la orden)');
    return;
  }

  console.log('----- ORDEN (payload exacto de la orden que fallo) -----');
  const o = await req('POST', '/dropi/orders', token, orderBody);
  console.log(`status=${o.status}`);
  console.log(o.body.slice(0, 1200));
}

main()
  .catch((e) => {
    console.error('ERR', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
