import { NextRequest, NextResponse } from 'next/server';
import type { ListingStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
const allowedStatuses = new Set(['PENDING_REVIEW', 'CHANGES_REQUESTED', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'ARCHIVED']);
const transitions: Record<string, Set<string>> = {
  DRAFT: new Set(['PENDING_REVIEW', 'ARCHIVED']),
  PENDING_REVIEW: new Set(['PUBLISHED', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED', 'ARCHIVED']),
  CHANGES_REQUESTED: new Set(['PENDING_REVIEW', 'REJECTED', 'ARCHIVED']),
  PUBLISHED: new Set(['SUSPENDED', 'EXPIRED', 'ARCHIVED']),
  REJECTED: new Set(['PENDING_REVIEW', 'ARCHIVED']),
  SUSPENDED: new Set(['PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED']),
  EXPIRED: new Set(['PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED']),
  ARCHIVED: new Set(['DRAFT', 'PENDING_REVIEW']),
};

type Context = { params: Promise<{ id: string }> };

/** Moderation status changes are permission-checked, transition-checked and audited atomically. */
export async function PATCH(request: NextRequest, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!hasPermission(user.roles, 'listings:moderate')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });

  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'A moderation payload is required.' }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const contactVisibility = input.contactVisibility;
  if (contactVisibility !== undefined && (!contactVisibility || typeof contactVisibility !== 'object' || Array.isArray(contactVisibility) || Object.entries(contactVisibility as Record<string, unknown>).some(([key, value]) => !['phone', 'email', 'whatsapp', 'map'].includes(key) || typeof value !== 'boolean'))) {
    return NextResponse.json({ error: 'Contact visibility must contain only boolean phone, email, whatsapp, or map permissions.' }, { status: 400 });
  }
  const target = typeof input.status === 'string' ? input.status.toUpperCase() : '';
  if (!target && contactVisibility === undefined) return NextResponse.json({ error: 'Provide a target status or contact visibility selection.' }, { status: 400 });
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 1000) : '';
  if (target && !allowedStatuses.has(target)) return NextResponse.json({ error: 'Unsupported moderation status.' }, { status: 400 });
  if ((target === 'CHANGES_REQUESTED' || target === 'REJECTED') && note.length < 3) {
    return NextResponse.json({ error: 'Add a short explanation for requesting changes or rejecting a listing.' }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.business.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
      if (!current) return { kind: 'not-found' as const };
      if (target && current.status !== target && !transitions[current.status]?.has(target)) return { kind: 'conflict' as const, currentStatus: current.status };
      const visibility = (contactVisibility && typeof contactVisibility === 'object' ? contactVisibility : {}) as Record<string, boolean>;
      const hasVisibilityChange = Object.keys(visibility).length > 0;
      const nextStatus = target || current.status;
      const updated = await tx.business.update({
        where: { id },
        data: { status: nextStatus as ListingStatus, ...(target === 'PUBLISHED' ? { publishedAt: new Date() } : {}), ...(hasVisibilityChange ? { ...(typeof visibility.phone === 'boolean' ? { showPhoneApproved: visibility.phone } : {}), ...(typeof visibility.email === 'boolean' ? { showEmailApproved: visibility.email } : {}), ...(typeof visibility.whatsapp === 'boolean' ? { showWhatsappApproved: visibility.whatsapp } : {}), ...(typeof visibility.map === 'boolean' ? { showMapApproved: visibility.map } : {}) } : {}) },
        select: { id: true, name: true, slug: true, status: true, publishedAt: true, updatedAt: true },
      });
      await tx.auditLog.create({ data: {
        actorId: user.id, action: hasVisibilityChange ? 'LISTING_CONTACT_VISIBILITY_UPDATED' : `LISTING_STATUS_${current.status}_TO_${nextStatus}`,
        entityType: 'Business', entityId: current.id,
        metadata: { from: current.status, to: nextStatus, note: note || null, contactVisibility: hasVisibilityChange ? visibility : null },
      } });
      return { kind: 'ok' as const, item: updated };
    });
    if (result.kind === 'not-found') return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
    if (result.kind === 'conflict') return NextResponse.json({ error: `Cannot change listing from ${result.currentStatus} to ${target}.`, currentStatus: result.currentStatus }, { status: 409 });
    return NextResponse.json({ item: result.item }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to update listing. Please retry.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
