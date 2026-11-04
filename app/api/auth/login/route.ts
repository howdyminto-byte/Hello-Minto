import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, SESSION_LIFETIME_SECONDS } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // Same-origin browser requests only. Add a durable rate limiter before public deployment.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && host) {
    try { if (new URL(origin).host !== host) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 }); }
    catch { return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 }); }
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 256) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { roles: { include: { role: true } } } });
  // Keep response identical for unknown users and wrong passwords.
  if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
  await prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt } });
  const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, roles: user.roles.map((r) => r.role.key) } }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(SESSION_COOKIE, rawToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: expiresAt });
  return response;
}
