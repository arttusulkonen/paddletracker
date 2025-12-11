import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const hostname = url.hostname;
  const { pathname } = url;

  // ─────────────────────────────────────────────────────────────
  // 1. DOMAIN REDIRECT (SEO & Rebranding)
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
  // 2. MOBILE REDIRECT LOGIC
  // ─────────────────────────────────────────────────────────────
  
  // ЗАЩИТА ОТ ЗАЦИКЛИВАНИЯ: Если мы уже в мобильной версии, ничего не делаем
  if (pathname.startsWith('/mobile')) {
    return NextResponse.next();
  }

  const ua = req.headers.get('user-agent') || '';
  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
      ua
    );

  if (!isMobile) return NextResponse.next();

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
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest|icons|brand|img).*)',
  ],
};