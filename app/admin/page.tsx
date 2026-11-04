import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/permissions';
import AdminClient from './admin-client';

export const metadata: Metadata = { title: 'Platform administration', robots: { index: false, follow: false } };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=%2Fadmin');
  if (!hasPermission(user.roles, 'admin:access')) redirect('/dashboard');
  return <AdminClient />;
}
