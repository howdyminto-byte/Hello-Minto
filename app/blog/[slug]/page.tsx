import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';

type Context = { params: Promise<{ slug: string }> };
async function getPost(slug: string) {
  return prisma.post.findFirst({ where: { slug, status: 'PUBLISHED', publishedAt: { lte: new Date() }, seo: { is: { noIndex: false } } }, select: { id: true, title: true, slug: true, excerpt: true, contentJson: true, featuredImage: true, publishedAt: true, author: { select: { name: true } }, seo: { select: { title: true, description: true, canonicalUrl: true } } } });
}
export async function generateMetadata({ params }: Context): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await getPost(slug);
    if (!post) return { title: 'Article not found', robots: { index: false, follow: false } };
    return { title: post.seo?.title || post.title, description: post.seo?.description || post.excerpt || undefined, alternates: post.seo?.canonicalUrl ? { canonical: post.seo.canonicalUrl } : { canonical: `/blog/${post.slug}` }, openGraph: { type: 'article', title: post.seo?.title || post.title, description: post.seo?.description || post.excerpt || undefined, images: post.featuredImage ? [post.featuredImage] : undefined, publishedTime: post.publishedAt?.toISOString() } };
  } catch { return { title: 'Article temporarily unavailable', robots: { index: false, follow: false } }; }
}
export default async function BlogArticlePage({ params }: Context) {
  const { slug } = await params;
  let post;
  try { post = await getPost(slug); } catch { notFound(); }
  if (!post) notFound();
  const content = post.contentJson as { text?: unknown } | null;
  const body = typeof content?.text === 'string' ? content.text : '';
  const paragraphs = body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const date = post.publishedAt?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: post.title, datePublished: post.publishedAt?.toISOString(), dateModified: post.publishedAt?.toISOString(), author: { '@type': 'Organization', name: post.author?.name || 'Hello Minto Editorial' }, mainEntityOfPage: `${process.env.APP_URL || 'http://localhost:3000'}/blog/${post.slug}`, image: post.featuredImage || undefined, description: post.seo?.description || post.excerpt || undefined };
  return <main className="public-article-shell"><header className="public-blog-nav"><Link href="/" className="public-blog-brand"><span>hm</span>Hello<span>Minto</span></Link><Link href="/blog" className="public-blog-back">All articles <span>↗</span></Link></header><article className="public-article"><Link href="/blog" className="public-article-back">← Back to the journal</Link><p className="public-blog-eyebrow">THE HELLO MINTO JOURNAL</p><h1>{post.title}</h1>{post.excerpt&&<p className="public-article-excerpt">{post.excerpt}</p>}<div className="public-article-byline">{post.author?.name || 'Hello Minto Editorial'}{date ? ` · ${date}` : ''}</div>{post.featuredImage&&<img className="public-article-featured" src={post.featuredImage} alt=""/>}<div className="public-article-body">{paragraphs.map((paragraph, index)=><p key={index}>{paragraph}</p>)}</div><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}/></article><footer className="public-blog-footer">© {new Date().getFullYear()} Hello Minto <span>Get Found. Get Leads. Grow Faster.</span></footer></main>;
}
