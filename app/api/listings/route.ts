import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission, ROLE } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100);
  const city = request.nextUrl.searchParams.get('city')?.trim().slice(0, 80);
  const category = request.nextUrl.searchParams.get('category')?.trim().slice(0, 80);
  const takeRaw = Number(request.nextUrl.searchParams.get('limit') ?? 20);
  const take = Number.isFinite(takeRaw) ? Math.min(Math.max(Math.trunc(takeRaw), 1), 50) : 20;
  const listings = await prisma.business.findMany({
    where: {
      status: 'PUBLISHED',
      ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }, { tagline: { contains: query, mode: 'insensitive' } }] } : {}),
      ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
      ...(category ? { categories: { some: { category: { name: { equals: category, mode: 'insensitive' } } } } } : {}),
    },
    select: { id: true, name: true, slug: true, tagline: true, description: true, city: true, region: true, logoUrl: true, coverUrl: true, phone: true, email: true, whatsapp: true, mapUrl: true, showPhoneApproved: true, showEmailApproved: true, showWhatsappApproved: true, showMapApproved: true, categories: { select: { category: { select: { name: true, slug: true } } } } },
    orderBy: [{ publishedAt: 'desc' }, { name: 'asc' }], take,
  });
  const items = listings.map(({ phone, email, whatsapp, mapUrl, showPhoneApproved, showEmailApproved, showWhatsappApproved, showMapApproved, ...listing }) => ({ ...listing, phone: showPhoneApproved ? phone : null, email: showEmailApproved ? email : null, whatsapp: showWhatsappApproved ? whatsapp : null, mapUrl: showMapApproved ? mapUrl : null }));
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!hasPermission(user.roles, 'listings:write:own') && !hasPermission(user.roles, 'listings:moderate')) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid listing payload.' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : '';
  const organizationId = typeof input.organizationId === 'string' ? input.organizationId : '';
  const description = typeof input.description === 'string' ? input.description.trim() : undefined;
  const city = typeof input.city === 'string' ? input.city.trim() : undefined;
  const phone = typeof input.phone === 'string' ? input.phone.trim() : undefined;
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : undefined;
  const whatsapp = typeof input.whatsapp === 'string' ? input.whatsapp.trim() : undefined;
  const mapUrl = typeof input.mapUrl === 'string' ? input.mapUrl.trim() : undefined;
  const website = typeof input.website === 'string' ? input.website.trim() : undefined;
  if (name.length < 2 || name.length > 160 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) {
    return NextResponse.json({ error: 'Provide a business name and a valid URL slug.' }, { status: 400 });
  }
  if (description && description.length > 10000) return NextResponse.json({ error: 'Description is too long.' }, { status: 400 });
  if (city && city.length > 100) return NextResponse.json({ error: 'City is too long.' }, { status: 400 });
  if (phone && phone.length > 40 || whatsapp && whatsapp.length > 40 || email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return NextResponse.json({ error: 'Check the submitted contact details.' }, { status: 400 });
  if (website && !isSafeHttpsUrl(website)) return NextResponse.json({ error: 'Website must be a valid HTTPS URL.' }, { status: 400 });
  if (mapUrl && !isGoogleMapsUrl(mapUrl)) return NextResponse.json({ error: 'Use a valid Google Maps URL for directions.' }, { status: 400 });
  const isAdmin = user.roles.includes(ROLE.SUPER_ADMIN) || user.roles.includes(ROLE.MODERATOR);
  let assignedOrganizationId = organizationId;
  if (!isAdmin) {
    const memberships = await prisma.organizationMember.findMany({ where: { userId: user.id }, select: { organizationId: true }, take: 2 });
    if (!memberships.length) return NextResponse.json({ error: 'Your account needs a business workspace before submitting a listing.' }, { status: 400 });
    assignedOrganizationId = organizationId || memberships[0].organizationId;
    if (!memberships.some((membership) => membership.organizationId === assignedOrganizationId)) return NextResponse.json({ error: 'You do not have access to this organization.' }, { status: 403 });
  }
  try {
    const created = await prisma.business.create({ data: { name, slug, description, city, phone: phone || null, email: email || null, whatsapp: whatsapp || null, mapUrl: mapUrl || null, website: website || null, organizationId: assignedOrganizationId || null, status: 'PENDING_REVIEW' }, select: { id: true, name: true, slug: true, status: true, createdAt: true } });
    return NextResponse.json({ item: created }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return NextResponse.json({ error: 'That slug is already in use.' }, { status: 409 });
    throw error;
  }
}

function isSafeHttpsUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch { return false; } }
function isGoogleMapsUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === 'https:' && ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'].includes(url.hostname); } catch { return false; } }
