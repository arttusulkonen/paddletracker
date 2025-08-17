// src/app/mobile/layout.tsx
import { ProtectedRoute } from '@/components/ProtectedRoutes';
import type { Viewport } from 'next';
import React from 'react';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
