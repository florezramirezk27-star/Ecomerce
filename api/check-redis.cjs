/**
 * Diagnostico de REDIS_URL que nunca imprime el secreto.
 *
 * Un `WRONGPASS` en produccion casi nunca es un problema de red: significa que
 * el servidor de Redis respondio y rechazo el AUTH, asi que host, puerto y TLS
 * ya estan bien y lo unico roto son las credenciales. Este script separa los
 * dos casos y ademas detecta los fallos de pegado (espacios, comillas, salto de
 * linea) que son la causa real casi siempre.
 *
 * Uso, con la variable ya en el entorno:
 *   node check-redis.cjs
 *
 * O con la URL de un archivo, sin escribirla en el comando:
 *   node check-redis.cjs
 *
 * Lee, en este orden de prioridad: process.env, ../.env (raiz), ./.env (api).
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const Redis = require('ioredis');

/**
 * Lee un `.env` sin trim. El trim esconderia justo lo que se busca detectar: un
 * `REDIS_URL` con un espacio o un salto de linea pegado del dashboard sigue
 * siendo un valor valido para el parser de `.env`, asi que hay que leerlo crudo
 * para poder avisar de ello.
 */
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].replace(/\r$/, '');
    if (
      value.length > 1 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function locate() {
  const sources = [
    ['process.env', process.env.REDIS_URL],
    ['../.env (raiz)', readEnvFile(path.resolve(__dirname, '..', '.env')).REDIS_URL],
    ['./.env (api)', readEnvFile(path.resolve(__dirname, '.env')).REDIS_URL],
  ];
  return sources.find(([, value]) => typeof value === 'string' && value !== '') ?? null;
}

const problems = [];

function problem(message) {
  problems.push(message);
  console.log('  [X] ' + message);
}

function ok(message) {
  console.log('  [OK] ' + message);
}

const found = locate();

if (!found) {
  console.log('REDIS_URL no esta definido en process.env, ../.env ni ./.env.');
  console.log('Configuralo en Render -> Environment antes de continuar.');
  process.exit(1);
}

const [source, raw] = found;

console.log('REDIS_URL leido de: ' + source);
console.log('');

// Huella de la URL completa. Permite comprobar si la variable que hay en el
// dashboard de Render es byte a byte la misma que se ha probado aqui, sin
// escribir el token en ningun sitio. Un solo caracter distinto cambia la
// huella, y es exactamente lo que produce el WRONGPASS.
console.log(
  'Huella de la URL: ' +
    createHash('sha256').update(raw.trim()).digest('hex').slice(0, 16),
);
console.log(
  '  (si esta huella no coincide con la de la URL buena, la variable esta ' +
    'corrupta)',
);
console.log('');

if (raw !== raw.trim()) {
  problem(
    'La URL tiene espacios al principio o al final. Render los guarda tal cual ' +
      'y Redis los manda como parte de la contrasena: recorta la variable antes de guardar.',
  );
}
if (/[\r\n]/.test(raw)) {
  problem('La URL contiene un salto de linea. Es el sintoma de un pegado multilinea en el dashboard de Render.');
}
if (/["'`]/.test(raw)) {
  problem('La URL contiene comillas. Si van ahi dentro, forman parte de la contrasena y el AUTH falla siempre.');
}
if (/\s/.test(raw.trim())) {
  problem('La URL contiene espacios dentro. Las URLs de Redis no llevan espacios.');
}

let url;
try {
  url = new URL(raw.trim());
} catch {
  console.log('  [X] La URL no es parseable. Formato esperado:');
  console.log('      rediss://default:TOKEN@REGION.upstash.io:6379');
  process.exit(1);
}

if (url.protocol === 'https:' || url.protocol === 'http:') {
  problem(
    'Estas usando la URL REST de Upstash (' +
      url.protocol +
      '//), que es para fetch y no para ioredis. En la consola de Upstash, ' +
      'copia la que empieza por rediss:// (en "Details" o en el bloque de variables).',
  );
} else if (url.protocol === 'redis:') {
  problem(
    'El esquema es redis:// sin TLS. Upstash exige rediss://. El codigo solo ' +
      'activa TLS si la URL empieza por rediss://.',
  );
} else if (url.protocol === 'rediss:') {
  ok('Esquema rediss:// (TLS).');
}

const username = decodeURIComponent(url.username || '');
const password = url.password;

if (!username) {
  problem('Falta el usuario. Upstash usa "default": rediss://default:TOKEN@...');
} else if (username !== 'default') {
  problem('El usuario es "' + username + '" y Upstash espera "default".');
} else {
  ok('Usuario "default".');
}

if (!password) {
  problem('Falta la contrasena: la URL no tiene TOKEN antes del @.');
} else {
  const decoded = decodeURIComponent(password);
  ok(
    'Contrasena presente (' +
      decoded.length +
      ' caracteres, mostrando solo los ultimos 4: ...' +
      decoded.slice(-4) +
      ').',
  );
  if (decoded.length < 20) {
    problem(
      'La contrasena es muy corta (' +
        decoded.length +
        ' caracteres). Los tokens de Upstash suelen tener mas de 40: probablemente este truncada.',
    );
  }
  if (decoded !== password) {
    ok('La contrasena traia percent-encoding y se decodifica bien.');
  }
}

if (url.port && url.port !== '6379') {
  problem('El puerto es ' + url.port + ' y Upstash usa el 6379.');
} else {
  ok('Puerto ' + (url.port || '6379 (por defecto)'));
}

ok('Host: ' + url.hostname + (url.hostname.endsWith('.upstash.io') ? '' : '  <- no parece de Upstash'));

const problemsBefore = problems.length;
if (problemsBefore > 0) {
  console.log('');
  console.log('La URL ya tiene problemas obvios. Corrigelos antes de probar la conexion.');
  process.exit(1);
}

console.log('');
console.log('Conectando con la URL tal cual esta...');

const client = new Redis(raw.trim(), {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 5000,
  retryStrategy: () => null,
  tls: raw.trim().startsWith('rediss://') ? {} : undefined,
});

// ioredis rechaza `connect()` con "Connection is closed." y deja el motivo real
// solo en el evento `error`. Sin capturar ese evento, un fallo de DNS o de TLS
// se reporta con un mensaje que no dice nada.
let realError = null;

client.on('error', (error) => {
  if (!realError) realError = error;
});

async function main() {
  try {
    await client.connect();
    const reply = await client.ping();
    console.log('  [OK] PING -> ' + reply);
    console.log('');
    console.log('La credencial es correcta. Si en Render sigue fallando, el valor');
    console.log('guardado ahi es distinto del que acabas de probar.');
    await client.quit();
  } catch (error) {
    const generic = !error?.message || /Connection is closed/i.test(error.message);
    explain(generic && realError ? realError : error);
  }
}

function explain(error) {
  const message = error?.message ?? String(error);
  console.log('  [X] ' + message);
  console.log('');

  if (message.includes('WRONGPASS')) {
    console.log('  Diagnostico: la red funciona y Redis rechazo el usuario o la contrasena.');
    console.log('  - El token de Upstash pudo rotarse: copia de nuevo la URL desde la consola.');
    console.log('  - La variable de Render puede tener un caracter de mas o de menos.');
    console.log('  - Confirma que usas la URL rediss:// de TU base y no la de otra.');
  } else if (message.includes('NOAUTH')) {
    console.log('  Diagnostico: llego la peticion sin credenciales. Falta default:TOKEN@ en la URL.');
  } else if (message.includes('ETIMEDOUT') || message.includes('ENOTFOUND') || message.includes('ECONNREFUSED')) {
    console.log('  Diagnostico: aqui si hay problema de red, no de credenciales.');
  } else if (/certificate|self.signed|altname|SSL/i.test(message)) {
    console.log('  Diagnostico: fallo de TLS. Upstash necesita rediss://, no redis://.');
  }

  console.log('');
  console.log('  Cuando la pase, cambiala en Render -> Environment -> Save & Deploy.');
  process.exitCode = 1;
}

main();
