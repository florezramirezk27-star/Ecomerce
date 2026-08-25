const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const p = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('kevin200427F', 10);
  await p.user.update({
    where: { email: 'florezramirezk.27@gmail.com' },
    data: { password: hash },
  });
  console.log('Password updated');
  await p['$disconnect']();
}
main().catch(e => { console.log(e); p['$disconnect'](); });
