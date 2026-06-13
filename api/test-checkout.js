const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3001,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // 1. Login
  const login = await request('POST', '/auth/login', {
    email: 'admin@kronio.com',
    password: 'Admin123',
  });
  console.log('1. Login:', login.status, login.body?.user?.email);
  const token = login.body.access_token;

  // Get a product ID
  const products = await request('GET', '/products', null, token);
  const productId = products.body?.[0]?.id || products.body?.items?.[0]?.id;
  console.log('   Product ID:', productId);

  if (!productId) {
    console.log('No products found, trying manually...');
    // The seed product IDs might be different
    return;
  }

  // 2. Add to cart
  const add = await request('POST', '/cart/add', { productId, quantity: 1 }, token);
  console.log('2. Add to cart:', add.status);

  // 3. Checkout with shipping
  const checkout = await request('POST', '/orders/checkout', {
    shippingName: 'Kevin Florez',
    shippingPhone: '3001234567',
    shippingAddress: 'Calle 123 # 45-67',
    shippingCity: 'Bogotá',
    shippingState: 'Cundinamarca',
    shippingZip: '110111',
    notes: 'Llamar antes de entregar',
  }, token);
  console.log('3. Checkout:', checkout.status);
  if (checkout.status === 201 || checkout.status === 200) {
    console.log('   Order ID:', checkout.body.id);
    console.log('   Status:', checkout.body.status);
    console.log('   Payment:', checkout.body.paymentMethod);
    console.log('   Shipping:', checkout.body.shippingName, '-', checkout.body.shippingAddress, checkout.body.shippingCity);
  } else {
    console.log('   Error:', JSON.stringify(checkout.body));
  }
}

main().catch(console.error);
