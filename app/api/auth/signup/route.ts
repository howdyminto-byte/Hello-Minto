import { randomBytes, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, SESSION_LIFETIME_SECONDS } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.get('host'); } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid sign-up details.' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const organizationName = typeof input.businessName === 'string' ? input.businessName.trim().slice(0, 160) : '';
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: 'Enter a valid name and email address.' }, { status: 400 });
  if (password.length < 12 || password.length > 256) return NextResponse.json({ error: 'Use a password between 12 and 256 characters.' }, { status: 400 });
  if (organizationName.length > 160) return NextResponse.json({ error: 'Business name is too long.' }, { status: 400 });
  try {
    const passwordHash = await hashPassword(password);
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name, email, passwordHash,
          roles: { create: { role: { connectOrCreate: {
            where: { key: 'BUSINESS_OWNER' },
            create: { key: 'BUSINESS_OWNER', name: 'Business Owner' },
          } } } },
        },
        select: { id: true, name: true, email: true },
      });
      const orgName = organizationName || `${name}'s Business`;
      const base = orgName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'business';
      let slug = base;
      for (let suffix = 2; await tx.organization.findUnique({ where: { slug } }); suffix++) slug = `${base}-${suffix}`;
      const organization = await tx.organization.create({ data: { name: orgName, slug, members: { create: { userId: user.id, memberRole: 'OWNER' } } }, select: { id: true, name: true } });
      return { user, organization };
    });
    const token = randomBytes(32).toString('base64url');
    await prisma.session.create({ data: { userId: created.user.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000) } });
    const response = NextResponse.json({ user: created.user, organization: created.organization, redirectTo: '/dashboard' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_LIFETIME_SECONDS });
    return response;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 });
    return NextResponse.json({ error: 'Unable to create your account right now.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
