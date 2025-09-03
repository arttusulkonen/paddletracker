import { ProtectedRoute } from '@/components/ProtectedRoutes';
import type { Metadata, Viewport } from 'next';
import React from 'react';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
  ],
  title: 'Smashlog — Mobile',
  description: 'Track, compete, and improve on mobile.',
};

export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      <main className="bg-background min-h-screen">{children}</main>
    </ProtectedRoute>
  );
}