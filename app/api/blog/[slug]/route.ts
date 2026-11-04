import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  try {
    const item = await prisma.post.findFirst({
      where: { slug, status: 'PUBLISHED', publishedAt: { lte: new Date() }, seo: { is: { noIndex: false } } },
      select: { id: true, title: true, slug: true, excerpt: true, renderedHtml: true, contentJson: true, featuredImage: true, publishedAt: true, updatedAt: true, author: { select: { name: true } }, seo: { select: { title: true, description: true, canonicalUrl: true } }, categories: { select: { category: { select: { name: true, slug: true } } } }, tags: { select: { tag: { select: { name: true, slug: true } } } } },
    });
    if (!item) return NextResponse.json({ error: 'Article not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ item }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch {
    return NextResponse.json({ error: 'Unable to load article.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
