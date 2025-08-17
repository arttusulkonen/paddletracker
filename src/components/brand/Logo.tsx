// src/components/brand/Logo.tsx
'use client';
import LogoFull from '@/public/brand/smashlog-logo.svg';

export default function Logo({ className }: { className?: string }) {
  return (
    <LogoFull className={className ?? 'h-8 w-auto'} aria-label='Smashlog' />
  );
}
