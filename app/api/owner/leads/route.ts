import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * Lead data is masked before it leaves the server for plans without the explicit
 * lead-management entitlement. The browser never receives private fields to blur.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!user.roles.includes('BUSINESS_OWNER') && !user.roles.includes('SUPER_ADMIN')) return NextResponse.json({ error: 'Business-owner access required.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id, memberRole: { in: ['OWNER', 'ADMIN'] } },
    select: { organizationId: true },
  });
  const organizationIds = memberships.map((item) => item.organizationId);
  if (!organizationIds.length) return NextResponse.json({ entitled: false, total: 0, items: [] }, { headers: { 'Cache-Control': 'no-store' } });

  const businesses = await prisma.business.findMany({
    where: { organizationId: { in: organizationIds } },
    select: {
      id: true, name: true,
      subscription: { select: { status: true, startsAt: true, currentPeriodEnd: true, planVersion: { select: { features: true, plan: { select: { name: true } } } } } },
    },
  });
  const byBusiness = new Map(businesses.map((b) => [b.id, b]));
  const businessIds = businesses.map((b) => b.id);
  const leads = businessIds.length ? await prisma.lead.findMany({
    where: { businessId: { in: businessIds } },
    select: { id: true, businessId: true, status: true, createdAt: true, name: true, contact: true, message: true },
    orderBy: { createdAt: 'desc' }, take: 100,
  }) : [];

  const items = leads.map((lead) => {
    const business = byBusiness.get(lead.businessId);
    const subscription = business?.subscription;
    const raw = subscription?.planVersion.features;
    const features = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const entitled = subscription?.status === 'ACTIVE' && !!subscription.startsAt && subscription.startsAt <= new Date() && !!subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date() && (features.leadManagement === true || features.lead_management === true || features.leads === true);
    return entitled ? {
      id: lead.id, businessName: business?.name ?? 'Business', status: lead.status, createdAt: lead.createdAt,
      name: lead.name, contact: lead.contact, message: lead.message, locked: false,
      planName: subscription?.planVersion.plan.name ?? null,
    } : {
      id: lead.id, businessName: business?.name ?? 'Business', status: lead.status, createdAt: lead.createdAt,
      reference: `Enquiry ${lead.id.slice(-5).toUpperCase()}`, locked: true,
    };
  });
  const entitledCount = items.filter((item) => !item.locked).length;
  return NextResponse.json({ total: leads.length, entitledCount, lockedCount: leads.length - entitledCount, items }, { headers: { 'Cache-Control': 'no-store' } });
}
