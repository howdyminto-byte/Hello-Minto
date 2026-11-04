import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function main() {
  if (process.env.BOOTSTRAP_ADMIN_CONFIRM !== 'CREATE_FIRST_ADMIN') {
    throw new Error('Refusing to run. Set BOOTSTRAP_ADMIN_CONFIRM=CREATE_FIRST_ADMIN for this one-time operation.');
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address.');
  if (!password || password.length < 16 || password.length > 256) throw new Error('ADMIN_PASSWORD must be 16–256 characters. Use a unique password from a secure secret manager.');

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error('A user with ADMIN_EMAIL already exists. No account or password was changed. Use the approved account-recovery process instead.');

  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  const passwordHash = `scrypt$${salt}$${derived.toString('hex')}`;

  await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { key: 'SUPER_ADMIN' },
      update: {},
      create: { key: 'SUPER_ADMIN', name: 'Super administrator' },
    });
    const user = await tx.user.create({
      data: { email, name: name || null, passwordHash, status: 'ACTIVE' },
    });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
  });
  process.stdout.write(`Created initial super-admin account for ${email}. Sign in, verify access, then remove the bootstrap secrets from the environment.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Admin bootstrap failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
