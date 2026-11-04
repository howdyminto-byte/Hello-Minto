import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
const statuses = ['DRAFT', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'] as const;

/** Admin/moderator queue. Only fields needed by the CMS are returned. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!hasPermission(user.roles, 'listings:read:any')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });

  const requestedStatus = request.nextUrl.searchParams.get('status')?.toUpperCase();
  if (requestedStatus && !(statuses as readonly string[]).includes(requestedStatus)) {
    return NextResponse.json({ error: 'Unsupported listing status filter.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const status = requestedStatus ? requestedStatus as typeof statuses[number] : undefined;
  const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100);
  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? 30);
  const take = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 30;
  const cursor = request.nextUrl.searchParams.get('cursor') || undefined;

  const items = await prisma.business.findMany({
    where: { ...(status ? { status } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }] } : {}) },
    select: { id: true, name: true, slug: true, tagline: true, city: true, region: true, status: true, createdAt: true, updatedAt: true, publishedAt: true, expiresAt: true, phone: true, email: true, whatsapp: true, mapUrl: true, showPhoneApproved: true, showEmailApproved: true, showWhatsappApproved: true, showMapApproved: true, organization: { select: { id: true, name: true } }, categories: { select: { category: { select: { name: true } } } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = items.length > take;
  const page = hasMore ? items.slice(0, take) : items;
  return NextResponse.json({ items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null }, { headers: { 'Cache-Control': 'no-store' } });
}
