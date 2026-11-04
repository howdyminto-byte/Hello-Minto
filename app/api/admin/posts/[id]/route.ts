import { NextRequest, NextResponse } from 'next/server';
import type { PostStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
const statuses = new Set(['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']);
const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const renderPlainText = (value: string) => value.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
const noStore = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: noStore });
  if (!hasPermission(user.roles, 'posts:write')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: noStore });
  const { id } = await context.params;
  let input: Record<string, unknown>;
  try { const parsed: unknown = await request.json(); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); input = parsed as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 240) : '';
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 200000) : '';
  const slug = typeof input.slug === 'string' ? slugify(input.slug) : slugify(title);
  const seoTitle = typeof input.seoTitle === 'string' ? input.seoTitle.trim().slice(0, 70) : '';
  const description = typeof input.metaDescription === 'string' ? input.metaDescription.trim().slice(0, 160) : '';
  const status = typeof input.status === 'string' ? input.status.toUpperCase() : 'DRAFT';
  const scheduledAt = typeof input.scheduledAt === 'string' ? new Date(input.scheduledAt) : null;
  if (title.length < 3 || !slug || !body) return NextResponse.json({ error: 'Title, slug, and article content are required.' }, { status: 400 });
  if (!statuses.has(status)) return NextResponse.json({ error: 'Unsupported article status.' }, { status: 400 });
  if ((status === 'PUBLISHED' || status === 'SCHEDULED') && !hasPermission(user.roles, 'posts:publish')) return NextResponse.json({ error: 'Publishing permission is required.' }, { status: 403 });
  if (status === 'SCHEDULED' && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) return NextResponse.json({ error: 'A future scheduledAt date is required for scheduled articles.' }, { status: 400 });
  try {
    const current = await prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true, status: true } });
    if (!current) return NextResponse.json({ error: 'Article not found.' }, { status: 404, headers: noStore });
    if (current.authorId !== user.id && !user.roles.includes('SUPER_ADMIN') && !user.roles.includes('BLOG_EDITOR')) return NextResponse.json({ error: 'You can edit only articles you authored.' }, { status: 403 });
    const collision = await prisma.post.findFirst({ where: { slug, NOT: { id } }, select: { id: true } });
    if (collision) return NextResponse.json({ error: 'That slug is already in use. Choose a unique slug.' }, { status: 409 });
    const result = await prisma.$transaction(async (tx) => {
      const revisionCount = await tx.postRevision.count({ where: { postId: id } });
      const updated = await tx.post.update({ where: { id }, data: {
        title, slug, excerpt: body.replace(/\s+/g, ' ').slice(0, 280), contentJson: { type: 'doc', format: 'plain-text-v1', text: body }, renderedHtml: renderPlainText(body),
        status: status as PostStatus,
        ...(status === 'PUBLISHED' ? { publishedAt: current.status === 'PUBLISHED' ? undefined : new Date(), scheduledAt: null } : status === 'SCHEDULED' ? { scheduledAt, publishedAt: null } : status === 'DRAFT' || status === 'IN_REVIEW' || status === 'ARCHIVED' ? { publishedAt: null, scheduledAt: null } : {}),
        seo: { upsert: { create: { title: seoTitle || title, description, noIndex: status !== 'PUBLISHED' }, update: { title: seoTitle || title, description, noIndex: status !== 'PUBLISHED' } } },
      }, select: { id: true, title: true, slug: true, status: true, publishedAt: true, scheduledAt: true, updatedAt: true } });
      await tx.postRevision.create({ data: { postId: id, revision: revisionCount + 1, content: { title, body, slug, seoTitle, metaDescription: description, status, scheduledAt: scheduledAt?.toISOString() ?? null } } });
      await tx.auditLog.create({ data: { actorId: user.id, action: `POST_UPDATED_${status}`, entityType: 'Post', entityId: id, metadata: { slug, status } } });
      return updated;
    });
    return NextResponse.json({ item: result }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Unable to save article. Please retry.' }, { status: 500, headers: noStore });
  }
}
