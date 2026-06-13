const jwtPath = require.resolve('@nestjs/jwt');
const path = require('path');
const baseDir = path.dirname(path.dirname(path.dirname(jwtPath)));
const jwt = require(path.join(baseDir, 'jsonwebtoken'));

const token = process.argv[2];
if (!token) {
  console.log('Usage: node test-verify-token.js <token>');
  process.exit(1);
}

const secrets = [
  '5b7018dbf2cec11be1a9569114a20063d50e19fcdd898cd2672bd910bf0dc05c',
  'dev-secret-key',
];

for (const secret of secrets) {
  try {
    const decoded = jwt.verify(token, secret);
    console.log('VERIFIED with', secret.substring(0, 8) + '...', ':', JSON.stringify(decoded));
  } catch (err) {
    console.log('FAILED with', secret.substring(0, 8) + '...', ':', err.message);
  }
}
