const http = require('http');
const jwt = require('jsonwebtoken');

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
    console.log('Token:', access_token.substring(0, 60) + '...');
    
    // Try verifying with the known secret
    const knownSecret = '5b7018dbf2cec11be1a9569114a20063d50e19fcdd898cd2672bd910bf0dc05c';
    try {
      const decoded = jwt.verify(access_token, knownSecret);
      console.log('Verified with known secret: OK');
      console.log('Decoded:', JSON.stringify(decoded));
      
      // Now the important part: is it being verified by the API?
      const profileReq = http.request({
        hostname: 'localhost', port: 3001, path: '/auth/profile',
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + access_token }
      }, (res2) => {
        let body2 = '';
        res2.on('data', d => body2 += d);
        res2.on('end', () => {
          console.log('Profile status:', res2.statusCode, 'body:', body2);
        });
      });
      profileReq.end();
      
    } catch(e) {
      console.log('Verification with known secret FAILED:', e.message);
      
      // Try with fallback
      try {
        jwt.verify(access_token, 'dev-secret-key');
        console.log('Verified with fallback secret: OK');
      } catch(e2) {
        console.log('Verification with fallback also FAILED:', e2.message);
      }
    }
  });
});
loginReq.write(loginData);
loginReq.end();
