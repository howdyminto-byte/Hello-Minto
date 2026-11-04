import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Hello Minto — Get Found. Get Leads. Grow Faster.', template: '%s | Hello Minto' },
  description: 'Discover trusted local businesses and services on Hello Minto.',
  metadataBase: new URL(process.env.APP_URL || 'http://localhost:3000'),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
