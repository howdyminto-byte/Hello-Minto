import { NextRequest, NextResponse } from 'next/server';
import type { PostStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string; revision: string }> };

export async function POST(request: NextRequest, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!hasPermission(user.roles, 'posts:write')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const { id, revision: rawRevision } = await context.params;
  const revisionNumber = Number(rawRevision);
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1) return NextResponse.json({ error: 'Invalid revision number.' }, { status: 400 });
  try {
    const post = await prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!post) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
    if (post.authorId !== user.id && !user.roles.includes('SUPER_ADMIN') && !user.roles.includes('BLOG_EDITOR')) return NextResponse.json({ error: 'You can restore only articles you authored.' }, { status: 403 });
    const oldRevision = await prisma.postRevision.findUnique({ where: { postId_revision: { postId: id, revision: revisionNumber } }, select: { content: true } });
    if (!oldRevision) return NextResponse.json({ error: 'Revision not found.' }, { status: 404 });
    const data = oldRevision.content as { title?: unknown; body?: unknown; slug?: unknown; seoTitle?: unknown; metaDescription?: unknown };
    const title = typeof data.title === 'string' ? data.title.slice(0, 240) : '';
    const body = typeof data.body === 'string' ? data.body.slice(0, 200000) : '';
    const slug = typeof data.slug === 'string' ? data.slug.slice(0, 180) : '';
    const seoTitle = typeof data.seoTitle === 'string' ? data.seoTitle.slice(0, 70) : title;
    const description = typeof data.metaDescription === 'string' ? data.metaDescription.slice(0, 160) : '';
    if (!title || !body || !slug) return NextResponse.json({ error: 'This legacy revision does not contain restorable article fields.' }, { status: 422 });
    const collision = await prisma.post.findFirst({ where: { slug, NOT: { id } }, select: { id: true } });
    if (collision) return NextResponse.json({ error: 'Cannot restore because the revision slug is now used by another article.' }, { status: 409 });
    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.postRevision.count({ where: { postId: id } });
      const updated = await tx.post.update({ where: { id }, data: {
        title, slug, excerpt: body.replace(/\s+/g, ' ').slice(0, 280), contentJson: { type: 'doc', format: 'plain-text-v1', text: body },
        renderedHtml: body.split(/\n\s*\n/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br>')}</p>`).join('\n'),
        status: 'DRAFT' as PostStatus, publishedAt: null, scheduledAt: null,
        seo: { upsert: { create: { title: seoTitle || title, description, noIndex: true }, update: { title: seoTitle || title, description, noIndex: true } } },
      }, select: { id: true, title: true, slug: true, status: true, updatedAt: true } });
      await tx.postRevision.create({ data: { postId: id, revision: count + 1, content: { title, body, slug, seoTitle, metaDescription: description, status: 'DRAFT', restoredFromRevision: revisionNumber } } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'POST_REVISION_RESTORED', entityType: 'Post', entityId: id, metadata: { restoredRevision: revisionNumber, newRevision: count + 1 } } });
      return updated;
    });
    return NextResponse.json({ item: result, restoredFromRevision: revisionNumber }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to restore this revision.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
