const http = require('http');

// First login
const loginData = JSON.stringify({ email: 'admin@kronio.com', password: 'Admin123' });
const loginReq = http.request({
  hostname: 'localhost', port: 3001, path: '/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
}, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const { access_token } = JSON.parse(body);
    const parts = access_token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    console.log('Payload:', JSON.stringify(payload));
    
    // Now test profile with token
    const profileReq = http.request({
      hostname: 'localhost', port: 3001, path: '/auth/profile',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + access_token }
    }, (res2) => {
      let body2 = '';
      res2.on('data', d => body2 += d);
      res2.on('end', () => {
        console.log('Profile status:', res2.statusCode);
        console.log('Profile body:', body2);
      });
    });
    profileReq.end();
  });
});
loginReq.write(loginData);
loginReq.end();
