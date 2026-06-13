const http = require('http');

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
    
    // Query database to check session
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    Promise.all([
      prisma.user.findUnique({ where: { id: payload.sub } }),
      prisma.session.findUnique({ where: { id: payload.sessionId } })
    ]).then(([user, session]) => {
      console.log('User found:', !!user);
      if (user) console.log('User id:', user.id, 'email:', user.email);
      
      console.log('Session found:', !!session);
      if (session) {
        console.log('Session id:', session.id);
        console.log('Session userId:', session.userId);
        console.log('Session userId === payload.sub:', session.userId === payload.sub);
        console.log('Session expiresAt:', session.expiresAt);
        console.log('Session expired:', session.expiresAt < new Date());
        console.log('Now:', new Date());
      }
      
      // Try to verify JWT signature using the env secret
      const crypto = require('crypto');
      const secret = process.env.JWT_SECRET || 'dev-secret-key';
      console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);
      
      return prisma.$disconnect();
    }).catch(e => console.error('DB error:', e));
  });
});
loginReq.write(loginData);
loginReq.end();
