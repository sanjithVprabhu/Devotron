import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VEDA Dashboard',
  description: 'Operate your business — every conversation, order, and proposal in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-zinc-50">{children}</body>
    </html>
  );
}
