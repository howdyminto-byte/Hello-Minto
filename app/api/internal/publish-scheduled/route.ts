import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

/** Invoke from a trusted scheduler with Authorization: Bearer <CRON_SECRET>. */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: 'Scheduler is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const auth = request.headers.get('authorization') ?? '';
  const supplied = Buffer.from(auth.startsWith('Bearer ') ? auth.slice(7) : '', 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const now = new Date();
  try {
    const due = await prisma.post.findMany({ where: { status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true, authorId: true, slug: true, scheduledAt: true }, take: 100, orderBy: { scheduledAt: 'asc' } });
    let published = 0;
    for (const post of due) {
      const didPublish = await prisma.$transaction(async (tx) => {
        const updated = await tx.post.updateMany({ where: { id: post.id, status: 'SCHEDULED', scheduledAt: { lte: now } }, data: { status: 'PUBLISHED', publishedAt: post.scheduledAt ?? now, scheduledAt: null } });
        if (!updated.count) return false;
        await tx.seoMetadata.updateMany({ where: { postId: post.id }, data: { noIndex: false } });
        await tx.auditLog.create({ data: { actorId: null, action: 'POST_PUBLISHED_BY_SCHEDULER', entityType: 'Post', entityId: post.id, metadata: { slug: post.slug, scheduledAt: post.scheduledAt?.toISOString() ?? null } } });
        return true;
      });
      if (didPublish) published += 1;
    }
    return NextResponse.json({ ok: true, checked: due.length, published, checkedAt: now.toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Scheduled publishing failed.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
