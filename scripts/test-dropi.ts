import https from 'https';

const NEW_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwOi8vYXBwLmRyb3BpLmNvOjgwIiwiaWF0IjoxNzgxNjQyMzk2LCJleHAiOjQ5MzczMTU5OTYsIm5iZiI6MTc4MTY0MjM5NiwianRpIjoiQmVXSWV3OW5DTnE5TTNjZCIsInN1YiI6IjY2MDgyNCIsInBydiI6Ijg3ZTBhZjFlZjlmZDE1ODEyZmRlYzk3MTUzYTE0ZTBiMDQ3NTQ2YWEiLCJhdWQiOiJTSE9QSUZZIiwidG9rZW5fdHlwZSI6IklOVEVHUkFUSU9OUyIsIndiX2lkIjoxLCJpbnRlZ3JhdGlvbl90eXBlIjoiU0hPUElGWSIsImludGVncmF0aW9uX3R5cGVfaWQiOjIsImlwX3VybCI6W10sImludGVncmF0aW9uX3VybCI6IiJ9.R2AUNmxBZ-F9eQsZ9IOHqjqPHYMZ2uQa3y_2LNCKFLQ';

function httpsRequest(
  hostname: string, path: string, method: string, bodyStr: string, extraHeaders: Record<string, string> = {},
): Promise<{ statusCode?: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method, timeout: 15000, headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr),
        Origin: 'https://app.dropi.co', Referer: 'https://app.dropi.co/',
        Accept: 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        ...extraHeaders,
      }},
      (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => resolve({ statusCode: res.statusCode, data })); },
    );
    req.on('error', reject); req.write(bodyStr); req.end();
  });
}

async function main() {
  console.log('========================================');
  console.log('   TEST: Nuevo token de Dropi');
  console.log('========================================\n');

  // Test 1: Catalog
  console.log('--- Test 1: Catálogo de productos ---');
  const catalogBody = JSON.stringify({
    pageSize: 5, startData: 0, privated_product: false, userVerified: false,
    favorite: false, country: 'COLOMBIA', get_stock: true, no_count: true,
    search_type: 'simple', with_collection: true,
  });

  const { statusCode: s1, data: d1 } = await httpsRequest('api.dropi.co', '/api/products/v4/index', 'POST', catalogBody, { 'X-Authorization': `Bearer ${NEW_TOKEN}` });
  console.log(`Status: ${s1}`);
  const p1 = JSON.parse(d1);
  if (s1 === 200 && p1.isSuccess) {
    console.log(`CATÁLOGO OK - ${p1.objects?.length || 0} productos`);
    console.log(`Total en catálogo: ${p1.total_count || 'N/A'}`);
    p1.objects?.forEach((p: any) => {
      const stock = p.type === 'VARIABLE' && p.variations
        ? p.variations.reduce((s: number, v: any) => s + (v.stock || 0), 0)
        : p.warehouse_product ? p.warehouse_product.reduce((s: number, w: any) => s + (w.stock || 0), 0) : 0;
      console.log(`  - ${p.name}`);
      console.log(`    ID: ${p.id} | Stock: ${stock} | $${p.sale_price} | Cat: ${p.categories?.[0]?.name || 'N/A'}`);
    });
  } else {
    console.log('FALLA:', JSON.stringify(p1, null, 2).substring(0, 500));
  }

  // Test 2: Search by ID
  console.log('\n--- Test 2: Buscar producto por ID ---');
  if (p1.isSuccess && p1.objects?.length > 0) {
    const testId = p1.objects[0].id;
    console.log(`Buscando producto ID: ${testId}`);
    const searchBody = JSON.stringify({ pageSize: 1, startData: 0, country: 'COLOMBIA', get_stock: true, no_count: true, search_type: 'id', keywords: String(testId) });
    const { statusCode: s2, data: d2 } = await httpsRequest('api.dropi.co', '/api/products/v4/index', 'POST', searchBody, { 'X-Authorization': `Bearer ${NEW_TOKEN}` });
    const p2 = JSON.parse(d2);
    if (s2 === 200 && p2.isSuccess && p2.objects?.length > 0) {
      const prod = p2.objects[0];
      console.log(`ENCONTRADO: ${prod.name}`);
      console.log(`  Precio venta: $${prod.sale_price}`);
      console.log(`  Precio sugerido: $${prod.suggested_price}`);
      console.log(`  SKU: ${prod.sku}`);
      console.log(`  Imágenes: ${prod.gallery?.length || 0}`);
    } else {
      console.log('No encontrado:', JSON.stringify(p2).substring(0, 300));
    }
  }

  // Test 3: Check connection status
  console.log('\n--- Test 3: Estado de conexión ---');
  const statusBody = JSON.stringify({});
  const { statusCode: s3, data: d3 } = await httpsRequest('api.dropi.co', '/api/user/profile', 'POST', statusBody, { 'X-Authorization': `Bearer ${NEW_TOKEN}` });
  console.log(`Status: ${s3}`);
  const p3 = JSON.parse(d3);
  if (s3 === 200) {
    console.log('USUARIO:', JSON.stringify(p3, null, 2).substring(0, 500));
  } else {
    console.log('Respuesta:', JSON.stringify(p3, null, 2).substring(0, 300));
  }

  console.log('\n========================================');
  console.log('   TEST COMPLETADO');
  console.log('========================================');
}

main().catch(console.error);
