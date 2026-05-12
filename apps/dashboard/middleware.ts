// Gates protected pages. Public surfaces:
//   - /login, /login/verify, /api/auth/*  (auth flow)
//   - /_next, /favicon                    (static)
//   - /api/health                         (probes)
//   - /c/<slug>, /api/c/<slug>            (public per-tenant chat — Phase 1)
//   - /@<slug>, /api/profile/<slug>       (public business profile — Phase 1)
//   - /discover, /api/discover            (public directory — Phase 2, page itself checks the feature flag)
//   - /                                   (home: directory if logged out, dashboard if logged in)
//
// Anything else without a session cookie redirects to /login.

import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/_next',
  '/favicon',
  '/api/health',
  '/c/',
  '/biz/',
  '/api/c/',
  '/api/profile/',
  '/api/reviews/',
  '/api/customer-status/',
  '/discover',
  '/api/discover',
];

const PUBLIC_EXACT = new Set(['/']);

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC_EXACT.has(path)) {
    return NextResponse.next();
  }
  if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }
  // Cheap auth check: presence of the iron-session cookie. The session is
  // re-validated in route handlers/pages via requireSession() — middleware
  // only redirects unauthenticated traffic.
  const cookie = req.cookies.get('veda_dashboard_session');
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
