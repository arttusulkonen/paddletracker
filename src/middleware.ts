import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  const isMobile =
    /Mobi|Android|iPhone|iPad|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(
      ua
    );

  if (!isMobile) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // root → /mobile
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/mobile';
    return NextResponse.redirect(url);
  }

  // /rooms/:id → /mobile/rooms/:id
  const roomMatch = pathname.match(/^\/rooms\/([^\/]+)$/);
  if (roomMatch) {
    const roomId = roomMatch[1];
    const url = req.nextUrl.clone();
    url.pathname = `/mobile/rooms/${roomId}`;
    return NextResponse.redirect(url);
  }

  // /profile/:uid → /mobile/profile/:uid
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
  matcher: ['/', '/rooms/:path*', '/profile/:path*'],
};