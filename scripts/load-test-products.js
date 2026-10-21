import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const API_BASE_URL = (__ENV.API_BASE_URL || '').replace(/\/$/, '');
const productErrors = new Rate('product_endpoint_errors');
const isRenderPublicService = /(^|\/\/)[^/]*\.onrender\.com(?:\/|$)/i.test(API_BASE_URL);

if (!API_BASE_URL) {
  throw new Error('Define API_BASE_URL explícitamente antes de ejecutar la prueba.');
}

if (isRenderPublicService && __ENV.ALLOW_PRODUCTION_LOAD_TEST !== 'YES') {
  throw new Error(
    'Destino Render detectado. Para autorizar únicamente esta prueba ligera, define ALLOW_PRODUCTION_LOAD_TEST=YES. No ejecutes pruebas agresivas contra producción.',
  );
}

export const options = {
  scenarios: {
    products_read_only: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 3,
      maxVUs: 5,
      gracefulStop: '15s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    product_endpoint_errors: ['rate<0.01'],
    dropped_iterations: ['count==0'],
  },
};

export default function () {
  const response = http.get(`${API_BASE_URL}/products?limit=20`, {
    headers: { Accept: 'application/json' },
    tags: { endpoint: 'products_list' },
    timeout: '20s',
  });

  const ok = check(response, {
    'GET /products devuelve HTTP 200': (r) => r.status === 200,
    'GET /products responde JSON': (r) =>
      String(r.headers['Content-Type'] || '').includes('application/json'),
  });

  productErrors.add(!ok);
}
