import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Returns the current authenticated identity without exposing the session token. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, roles: user.roles },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
