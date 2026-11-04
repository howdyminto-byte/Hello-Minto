import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '@/app/auth-forms';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };
export default function SignInPage() { return <Suspense fallback={<main className="auth-shell">Loading sign in…</main>}><AuthForm mode="signin" /></Suspense>; }
