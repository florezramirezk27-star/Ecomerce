import https from 'https';
import 'dotenv/config';

function httpsRequest(
  hostname: string, path: string, method: string, bodyStr: string, extraHeaders: Record<string, string> = {},
): Promise<{ statusCode?: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method, timeout: 20000, headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr),
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
        ...extraHeaders,
      }},
      (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => resolve({ statusCode: res.statusCode, data })); },
    );
    req.on('error', reject); req.write(bodyStr); req.end();
  });
}

async function main() {
  const user = process.env.AVEONLINE_USER || '';
  const password = process.env.AVEONLINE_PASS || '';

  const authV1 = JSON.stringify({ tipo: 'auth', usuario: user, clave: password });
  const r1 = await httpsRequest('app.aveonline.co', '/api/comunes/v1.0/autenticarusuario.php', 'POST', authV1);
  const p1 = JSON.parse(r1.data);
  if (p1.status !== 'ok') { console.log('Auth falló'); return; }
  const v1token = p1.token;
  const idempresa = 44541;

  console.log(`Token V1 OK. idempresa: ${idempresa}\n`);

  const tests: Array<[string, string, any]> = [
    // [host, path, body]
    ['aveonline.co', '/api/nal/v1.0/sandbox/guia.php', { tipo: 'obtenerEstadoAuth', token: v1token, id: idempresa, guia: '', ordencompra: '', referencia: '' }],
    ['aveonline.co', '/api/nal/v1.0/sandbox/guia.php', { tipo: 'obtenerEstadoAuth', token: v1token, id: 25505, guia: '', ordencompra: '', referencia: '' }],
    ['app.aveonline.co', '/api/nal/v1.0/cotizacion.php', { tipo: 'cotizacion', token: v1token, idempresa, idagente: '', origen: 'BOGOTA(CUNDINAMARCA)', destino: 'MEDELLIN(ANTIOQUIA)', unidades: 1, peso: 1, valor: 50000 }],
    ['aveonline.co', '/api/nal/v1.0/cotizacion.php', { tipo: 'cotizacion', token: v1token, idempresa, idagente: '', origen: 'BOGOTA(CUNDINAMARCA)', destino: 'MEDELLIN(ANTIOQUIA)', unidades: 1, peso: 1, valor: 50000 }],
  ];

  for (const [host, path, body] of tests) {
    const bodyStr = JSON.stringify(body);
    const res = await httpsRequest(host, path, 'POST', bodyStr);
    const isJson = res.data.trim().startsWith('{');
    console.log(`${host}${path} => ${res.statusCode} ${isJson ? 'JSON' : 'HTML'}`);
    if (isJson) {
      const j = JSON.parse(res.data);
      console.log(`   ${JSON.stringify(j).substring(0, 400)}`);
      if (j.guias) console.log(`   >>> guias: ${j.guias.length} (sandbox OK)`);
      if (j.status === 'ok' && (j.resultado || j.total || j.transportadoras)) console.log('   >>> COTIZACION OK');
    } else {
      console.log(`   HTML (${res.data.trim().substring(0, 80)})`);
    }
  }
}

main().catch(console.error);