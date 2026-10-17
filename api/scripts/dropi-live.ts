/* eslint-disable no-console */
/**
 * Prueba EN VIVO contra Dropi (solo lectura + cotizacion, NO crea ordenes).
 *
 * Inicia sesion real (email + password + 2FA TOTP) reutilizando los mismos
 * servicios del backend, luego:
 *   1. Muestra el producto real: type, variations, warehouse_product, stock.
 *   2. Resuelve el contexto de dropshipper (proveedor + bodegas candidatas).
 *   3. Cotiza (/bff/orders/quote) un carrito con esos productos.
 *
 * Uso (desde api/):
 *   npx ts-node --transpile-only scripts/dropi-live.ts
 */
import { DropiClient } from '../src/modules/dropi/dropi.client';
import { DropiAuthService } from '../src/modules/dropi/dropi.auth';
import { DropiProductsService } from '../src/modules/dropi/dropi.products';
import { DropiOrdersService } from '../src/modules/dropi/dropi.orders';

const configStub = {
  get: (key: string): string | undefined => process.env[key],
} as never;

// `resolveDropshipperContext` no toca la base salvo `marcarImportados`, que solo
// marca `imported`; un stub vacio alcanza.
const prismaStub = {
  product: { findMany: async () => [], findFirst: async () => null },
} as never;
const cacheStub = {} as never;

const PRODUCTS = [2160787, 1742263, 1734566, 2257777];

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function main() {
  const client = new DropiClient();
  const auth = new DropiAuthService(client, configStub);
  const products = new DropiProductsService(
    client,
    auth,
    prismaStub,
    cacheStub,
  );
  const orders = new DropiOrdersService(client, auth, products);

  console.log(
    `email=${process.env.DROPI_EMAIL} password=${
      process.env.DROPI_PASSWORD ? '***set***' : '(vacio)'
    } 2fa=${process.env.DROPI_2FA_SECRET ? '***set***' : '(vacio)'}`,
  );

  await auth.login();
  const token = await auth.getToken();
  console.log(`login -> token ${token ? 'OK' : 'FALLIDO'}\n`);
  if (!token) throw new Error('No se pudo autenticar con Dropi');

  for (const id of PRODUCTS) {
    console.log('='.repeat(70));
    console.log(`PRODUCTO ${id}`);
    const ctx = await products.resolveDropshipperContext(id);
    const product = await products.getProductById(id);
    if (!product) {
      console.log('  (Dropi no devolvio el producto)');
      continue;
    }
    console.log(`  name=${product.name} type=${product.type}`);
    console.log(`  sale_price=${product.sale_price} suggested=${product.suggested_price}`);
    console.log(`  user_id=${product.user?.id}`);
    console.log(`  warehouse_product=${safeJson(product.warehouse_product)}`);
    console.log(`  variations=${safeJson(product.variations)}`);
    console.log(`  ctx=${safeJson(ctx)}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('COTIZACION /bff/orders/quote');
  const quote = await orders.quoteShipping({
    products: [
      { id: 2160787, variation_id: null, quantity: 1, price: 59900 },
      { id: 1742263, variation_id: null, quantity: 1, price: 135000 },
    ],
    ciudad_destino: 'Bogota',
    estado_destino: 'BOGOTA',
    cod_dane: '11001',
    EnvioConCobro: true,
    ValorDeclarado: 194900,
    dir: 'Calle 1 # 1-1',
    destination_name: 'Cliente Prueba',
    destination_phone: '3000000000',
    zip_code: null,
    colonia: null,
    peso: 1,
    largo: 10,
    ancho: 10,
    alto: 10,
    warehouse: 10913,
  } as never);
  console.log(`success=${quote.success} message=${quote.message}`);
  console.log(safeJson(quote.rawResponse));
}

main()
  .catch((e) => {
    console.error('LIVE ERROR:', e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(0));
