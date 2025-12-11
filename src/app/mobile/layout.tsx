import { ProtectedRoute } from '@/components/ProtectedRoutes';
import type { Metadata, Viewport } from 'next';
import React from 'react';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
  ],
};

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://smashlog.fi/',
  },
};

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <main className='bg-background min-h-screen'>{children}</main>
    </ProtectedRoute>
  );
}
