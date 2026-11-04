import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { AddBusinessForm } from './form';
export const metadata: Metadata = { title: 'Add a business listing', robots: { index: false, follow: false } };
export default async function AddBusinessPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/signin?next=%2Fdashboard%2Fadd-business');
  return <AddBusinessForm />;
}
