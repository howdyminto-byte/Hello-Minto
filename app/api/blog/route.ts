import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
const cacheHeaders = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' };

export async function GET(request: NextRequest) {
  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? 20);
  const take = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 20;
  const cursor = request.nextUrl.searchParams.get('cursor');
  try {
    const items = await prisma.post.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: new Date() }, seo: { is: { noIndex: false } } },
      select: { id: true, title: true, slug: true, excerpt: true, featuredImage: true, publishedAt: true, updatedAt: true, author: { select: { name: true } }, seo: { select: { title: true, description: true, canonicalUrl: true } } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return NextResponse.json({ items: page, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null }, { headers: cacheHeaders });
  } catch {
    return NextResponse.json({ error: 'Unable to load published articles.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
