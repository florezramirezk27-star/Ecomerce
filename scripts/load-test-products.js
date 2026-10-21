import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const API_BASE_URL = (__ENV.API_BASE_URL || '').replace(/\/$/, '');
const productErrors = new Rate('product_endpoint_errors');

if (!API_BASE_URL) {
  throw new Error(
    'Define API_BASE_URL con la URL del backend de pruebas. No apuntes a producción para una prueba de carga.',
  );
}

export const options = {
  scenarios: {
    products_read_only: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 5,
      maxVUs: 20,
      stages: [
        { target: 1, duration: '1m' },
        { target: 2, duration: '1m' },
        { target: 5, duration: '1m' },
        { target: 10, duration: '1m' },
      ],
      gracefulStop: '30s',
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
  const response = http.get(
    `${API_BASE_URL}/products?limit=20`,
    {
      headers: { Accept: 'application/json' },
      tags: { endpoint: 'products_list' },
      timeout: '20s',
    },
  );

  const ok = check(response, {
    'GET /products devuelve HTTP 200': (r) => r.status === 200,
    'GET /products responde JSON': (r) =>
      String(r.headers['Content-Type'] || '').includes('application/json'),
  });

  productErrors.add(!ok);
  sleep(0.2);
}
