import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';

export const SESSION_COOKIE = 'hm_session';
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Resolves a session from its hashed database token. No token or password is logged. */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roles: session.user.roles.map((assignment) => assignment.role.key),
    sessionId: session.id,
  };
}

export { SESSION_LIFETIME_SECONDS };
