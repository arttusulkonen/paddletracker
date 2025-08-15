// src/app/mobile/layout.tsx
import { ProtectedRoute } from '@/components/ProtectedRoutes';
import React from 'react';

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