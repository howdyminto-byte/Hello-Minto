import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/app/auth-forms';
export const metadata: Metadata = { title: 'Create an account', robots: { index: false, follow: false } };
export default function SignUpPage() { return <Suspense fallback={<main className="auth-shell">Loading sign up…</main>}><AuthForm mode="signup" /></Suspense>; }
