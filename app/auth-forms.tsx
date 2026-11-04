'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Building2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await fetch(isSignup ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSignup ? { name, businessName, email, password } : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || 'Unable to continue. Please try again.'); return; }
      if (isSignup) { router.push('/dashboard'); return; }
      const roles: string[] = data.user?.roles ?? [];
      const next = searchParams.get('next');
      if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/signin') && !next.startsWith('/signup')) router.push(next);
      else if (roles.includes('SUPER_ADMIN') || roles.includes('MODERATOR') || roles.includes('BLOG_EDITOR')) router.push('/admin');
      else router.push('/dashboard');
      router.refresh();
    } catch { setError('A network error occurred. Please try again.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell"><Link href="/" className="brand auth-brand"><span className="brand-mark">hm</span><span>Hello<span className="brand-accent">Minto</span><small>Get Found. Get Leads. Grow Faster.</small></span></Link><section className="auth-card"><div className="auth-icon"><Building2 size={25}/></div><div className="eyebrow eyebrow-dark">{isSignup ? 'START GROWING YOUR PRESENCE' : 'WELCOME BACK'}</div><h1>{isSignup ? 'Create your account.' : 'Sign in to Hello Minto.'}</h1><p>{isSignup ? 'Create an account to submit your business listing. Your listing will be reviewed before it goes live.' : 'Access the dashboard and features available to your account.'}</p><form className="auth-form" onSubmit={submit}>{isSignup && <><label>Full name<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" maxLength={120}/></label><label>Business name <span className="optional-label">Optional</span><input autoComplete="organization" value={businessName} onChange={e=>setBusinessName(e.target.value)} placeholder="Your business or organisation" maxLength={160}/></label></>}<label>Email address<span className="auth-input"><Mail size={17}/><input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" maxLength={254}/></span></label><label>Password<span className="auth-input"><LockKeyhole size={17}/><input required type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={isSignup ? 'At least 12 characters' : 'Your password'} minLength={isSignup ? 12 : 1} maxLength={256}/></span></label>{error && <p className="auth-error" role="alert">{error}</p>}<button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'} <ArrowRight size={17}/></button></form><div className="auth-security"><ShieldCheck size={16}/> Secure sign-in. Your dashboard is based on your assigned permissions.</div><p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to Hello Minto?'} <Link href={isSignup ? '/signin' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</Link></p><Link href="/" className="auth-back">← Back to Hello Minto</Link></section><p className="auth-legal">By continuing, you agree to use Hello Minto responsibly. Listing submissions are subject to review.</p></main>;
}
