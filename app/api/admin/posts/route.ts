import { NextRequest, NextResponse } from 'next/server';
import type { PostStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
const postStatuses = new Set(['DRAFT', 'IN_REVIEW', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']);
const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180);
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const renderPlainText = (value: string) => value.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: noStore });
  if (!hasPermission(user.roles, 'posts:read')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: noStore });
  const q = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100);
  const statusParam = request.nextUrl.searchParams.get('status')?.toUpperCase();
  if (statusParam && !postStatuses.has(statusParam)) return NextResponse.json({ error: 'Unsupported post status filter.' }, { status: 400 });
  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? 30);
  const take = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 30;
  try {
    const items = await prisma.post.findMany({
      where: { ...(statusParam ? { status: statusParam as PostStatus } : {}), ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] } : {}) },
      select: { id: true, title: true, slug: true, excerpt: true, contentJson: true, status: true, publishedAt: true, scheduledAt: true, createdAt: true, updatedAt: true, author: { select: { id: true, name: true, email: true } }, seo: { select: { title: true, description: true, canonicalUrl: true, noIndex: true } }, revisions: { select: { revision: true }, orderBy: { revision: 'desc' }, take: 1 } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take,
    });
    return NextResponse.json({ items }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Unable to load articles.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: noStore });
  if (!hasPermission(user.roles, 'posts:write')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: noStore });
  let input: Record<string, unknown>;
  try { const parsed: unknown = await request.json(); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); input = parsed as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }); }
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 240) : '';
  const body = typeof input.body === 'string' ? input.body.trim().slice(0, 200000) : '';
  const requestedSlug = typeof input.slug === 'string' ? slugify(input.slug) : slugify(title);
  const seoTitle = typeof input.seoTitle === 'string' ? input.seoTitle.trim().slice(0, 70) : '';
  const description = typeof input.metaDescription === 'string' ? input.metaDescription.trim().slice(0, 160) : '';
  const status = typeof input.status === 'string' ? input.status.toUpperCase() : 'DRAFT';
  const scheduledAt = typeof input.scheduledAt === 'string' ? new Date(input.scheduledAt) : null;
  if (title.length < 3 || !requestedSlug || body.length < 1) return NextResponse.json({ error: 'Title (at least 3 characters), slug, and article content are required.' }, { status: 400 });
  if (!postStatuses.has(status)) return NextResponse.json({ error: 'Unsupported article status.' }, { status: 400 });
  if ((status === 'PUBLISHED' || status === 'SCHEDULED') && !hasPermission(user.roles, 'posts:publish')) return NextResponse.json({ error: 'Publishing permission is required.' }, { status: 403 });
  if (status === 'SCHEDULED' && (!scheduledAt || Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now())) return NextResponse.json({ error: 'A future scheduledAt date is required for scheduled articles.' }, { status: 400 });
  try {
    const existing = await prisma.post.findUnique({ where: { slug: requestedSlug }, select: { id: true } });
    if (existing) return NextResponse.json({ error: 'That slug is already in use. Choose a unique slug.' }, { status: 409 });
    const now = new Date();
    const item = await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({ data: {
        authorId: user.id, title, slug: requestedSlug, excerpt: body.replace(/\s+/g, ' ').slice(0, 280),
        contentJson: { type: 'doc', format: 'plain-text-v1', text: body }, renderedHtml: renderPlainText(body),
        status: status as PostStatus, ...(status === 'PUBLISHED' ? { publishedAt: now } : {}), ...(status === 'SCHEDULED' ? { scheduledAt } : {}),
        seo: { create: { title: seoTitle || title, description, noIndex: status !== 'PUBLISHED' } },
        revisions: { create: { revision: 1, content: { title, body, slug: requestedSlug, seoTitle, metaDescription: description, status, scheduledAt: scheduledAt?.toISOString() ?? null } } },
      }, select: { id: true, title: true, slug: true, status: true, publishedAt: true, scheduledAt: true, updatedAt: true } });
      await tx.auditLog.create({ data: { actorId: user.id, action: `POST_CREATED_${status}`, entityType: 'Post', entityId: post.id, metadata: { slug: post.slug } } });
      return post;
    });
    return NextResponse.json({ item }, { status: 201, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Unable to create article. Check the slug and try again.' }, { status: 500, headers: noStore });
  }
}
