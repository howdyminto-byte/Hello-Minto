import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
export const dynamic = 'force-dynamic';
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!user.roles.includes('BUSINESS_OWNER') && !user.roles.includes('SUPER_ADMIN')) return NextResponse.json({ error: 'Business-owner access required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const memberships = await prisma.organizationMember.findMany({ where: { userId: user.id, memberRole: { in: ['OWNER', 'ADMIN'] } }, select: { organizationId: true } });
  const organizationIds = memberships.map((membership) => membership.organizationId);
  const items = organizationIds.length ? await prisma.business.findMany({
    where: { organizationId: { in: organizationIds } },
    select: { id: true, name: true, slug: true, status: true, city: true, updatedAt: true, phone: true, email: true, whatsapp: true, mapUrl: true, showPhoneApproved: true, showEmailApproved: true, showWhatsappApproved: true, showMapApproved: true },
    orderBy: { updatedAt: 'desc' }, take: 100,
  }) : [];
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
