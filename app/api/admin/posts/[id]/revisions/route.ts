import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!hasPermission(user.roles, 'posts:read')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const { id } = await context.params;
  try {
    const post = await prisma.post.findUnique({ where: { id }, select: { id: true, authorId: true } });
    if (!post) return NextResponse.json({ error: 'Article not found.' }, { status: 404 });
    if (post.authorId !== user.id && !user.roles.includes('SUPER_ADMIN') && !user.roles.includes('BLOG_EDITOR')) return NextResponse.json({ error: 'You cannot view this article history.' }, { status: 403 });
    const items = await prisma.postRevision.findMany({ where: { postId: id }, select: { revision: true, createdAt: true, content: true }, orderBy: { revision: 'desc' }, take: 50 });
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to load article revisions.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
