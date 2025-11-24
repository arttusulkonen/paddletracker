// src/middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = url.hostname;
  const { pathname } = url;

  // ─────────────────────────────────────────────────────────────
  // 1. DOMAIN REDIRECT (SEO & Rebranding)
  // Перенаправляем со старых технических доменов на основной
  // ─────────────────────────────────────────────────────────────
  const oldDomains = [
    'tabletennis-f4c23.web.app',
    'tabletennis-f4c23.firebaseapp.com',
  ];

  if (oldDomains.includes(hostname)) {
    const newUrl = new URL(url.toString());
    newUrl.hostname = 'smashlog.fi';
    newUrl.protocol = 'https:';
    newUrl.port = '';
    return NextResponse.redirect(newUrl);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. MOBILE REDIRECT LOGIC (Ваш старый код)
  // ─────────────────────────────────────────────────────────────
  const ua = req.headers.get('user-agent') || '';
  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
      ua
    );

  // Если это не мобильный телефон — ничего не делаем
  if (!isMobile) return NextResponse.next();

  // Логика перенаправления мобильных путей

  // Главная: root → /mobile
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/mobile';
    return NextResponse.redirect(url);
  }

  // Комнаты: /rooms/:id → /mobile/rooms/:id
  const roomMatch = pathname.match(/^\/rooms\/([^\/]+)$/);
  if (roomMatch) {
    const roomId = roomMatch[1];
    const url = req.nextUrl.clone();
    url.pathname = `/mobile/rooms/${roomId}`;
    return NextResponse.redirect(url);
  }

  // Профиль: /profile/:uid → /mobile/profile/:uid
  const profileMatch = pathname.match(/^\/profile\/([^\/]+)$/);
  if (profileMatch) {
    const uid = profileMatch[1];
    const url = req.nextUrl.clone();
    url.pathname = `/mobile/profile/${uid}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Важно: matcher должен охватывать весь сайт, чтобы редирект домена работал везде
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|icons|brand|img).*)',
  ],
};
