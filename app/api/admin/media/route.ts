import { createHash, createHmac, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_BYTES = 10 * 1024 * 1024;
const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const noStore = { 'Cache-Control': 'no-store' };
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value).digest();
const awsEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
function matchesSignature(bytes: Buffer, mime: string) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (mime === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  return false;
}
function storageTarget(key: string) {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const region = process.env.OBJECT_STORAGE_REGION;
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.replace(/\/$/, '');
  if (!bucket || !region) throw new Error('Object storage bucket and region are not configured.');
  if (endpoint) {
    const url = new URL(endpoint);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${awsEncode(bucket)}/${key.split('/').map(awsEncode).join('/')}`;
    return { url, region };
  }
  const url = new URL(`https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(awsEncode).join('/')}`);
  return { url, region };
}
function signPut(url: URL, region: string, mime: string, bytes: Buffer) {
  const accessKey = process.env.OBJECT_STORAGE_ACCESS_KEY;
  const secretKey = process.env.OBJECT_STORAGE_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('Object storage credentials are not configured.');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(bytes);
  const canonicalHeaders = `content-type:${mime}\nhost:${url.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', url.pathname, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(Buffer.from(canonicalRequest))].join('\n');
  const dateKey = hmac(`AWS4${secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    'Content-Type': mime,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: noStore });
  if (!hasPermission(user.roles, 'posts:read')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: noStore });
  const rawLimit = Number(request.nextUrl.searchParams.get('limit') ?? 50);
  const take = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
  try {
    const items = await prisma.mediaAsset.findMany({ where: user.roles.includes('SUPER_ADMIN') ? {} : { uploaderId: user.id }, orderBy: { createdAt: 'desc' }, take, select: { id: true, publicUrl: true, filename: true, mimeType: true, sizeBytes: true, altText: true, createdAt: true, uploader: { select: { name: true } } } });
    return NextResponse.json({ items }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: 'Unable to load media library.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: noStore });
  if (!hasPermission(user.roles, 'posts:write')) return NextResponse.json({ error: 'Forbidden.' }, { status: 403, headers: noStore });
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BYTES + 128 * 1024) return NextResponse.json({ error: 'Upload request exceeds the allowed 10 MB image limit.' }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'Upload must use multipart form data.' }, { status: 400 }); }
  const fileValue = form.get('file');
  const altTextValue = form.get('altText');
  const altText = typeof altTextValue === 'string' ? altTextValue.trim().slice(0, 300) : '';
  if (!fileValue || typeof fileValue === 'string' || typeof fileValue.arrayBuffer !== 'function') return NextResponse.json({ error: 'Choose an image file to upload.' }, { status: 400 });
  const file = fileValue as File;
  if (file.size < 1 || file.size > MAX_BYTES) return NextResponse.json({ error: 'Image must be between 1 byte and 10 MB.' }, { status: 413 });
  const extension = mimeExtensions[file.type];
  if (!extension) return NextResponse.json({ error: 'Supported formats are JPEG, PNG, WebP and GIF. SVG is not accepted.' }, { status: 415 });
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!matchesSignature(bytes, file.type)) return NextResponse.json({ error: 'The file contents do not match the selected image format.' }, { status: 415 });
    const publicBase = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (!publicBase) return NextResponse.json({ error: 'OBJECT_STORAGE_PUBLIC_BASE_URL must be configured before uploads are enabled.' }, { status: 503 });
    const publicBaseUrl = new URL(publicBase);
    if (process.env.NODE_ENV === 'production' && publicBaseUrl.protocol !== 'https:') return NextResponse.json({ error: 'Public media URLs must use HTTPS in production.' }, { status: 503 });
    const now = new Date();
    const key = `media/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${extension}`;
    const { url, region } = storageTarget(key);
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Object storage must use HTTPS in production.' }, { status: 503 });
    const headers = signPut(url, region, file.type, bytes);
    const response = await fetch(url, { method: 'PUT', headers, body: bytes, cache: 'no-store' });
    if (!response.ok) return NextResponse.json({ error: 'Object storage rejected the upload. Check bucket permissions and endpoint configuration.' }, { status: 502 });
    const publicUrl = `${publicBase}/${key.split('/').map(awsEncode).join('/')}`;
    const filename = file.name.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180) || `image.${extension}`;
    const item = await prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({ data: { uploaderId: user.id, objectKey: key, publicUrl, filename, mimeType: file.type, sizeBytes: bytes.byteLength, altText: altText || null } });
      await tx.auditLog.create({ data: { actorId: user.id, action: 'MEDIA_ASSET_UPLOADED', entityType: 'MediaAsset', entityId: asset.id, metadata: { mimeType: asset.mimeType, sizeBytes: asset.sizeBytes } } });
      return asset;
    });
    return NextResponse.json({ item: { id: item.id, publicUrl: item.publicUrl, filename: item.filename, mimeType: item.mimeType, sizeBytes: item.sizeBytes, altText: item.altText, createdAt: item.createdAt } }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error && /not configured/.test(error.message) ? error.message : 'Unable to upload image. Check object storage configuration and retry.';
    return NextResponse.json({ error: message }, { status: 503, headers: noStore });
  }
}
