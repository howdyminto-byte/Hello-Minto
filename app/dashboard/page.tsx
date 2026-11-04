import type { Metadata } from 'next';
import { OwnerDashboard } from './owner-dashboard';
export const metadata: Metadata = { title: 'Business owner dashboard', robots: { index: false, follow: false } };
export default function DashboardPage() { return <OwnerDashboard />; }
