import { compactVerify } from 'jose';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET ?? '';

function redirectToLogin(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('token')?.value;

    if (token && JWT_SECRET) {
      try {
        const { payload } = await compactVerify(
          token,
          new TextEncoder().encode(JWT_SECRET),
        );
        const claims = JSON.parse(new TextDecoder().decode(payload));

        if (claims.role === 'ADMIN' && claims.sessionId) {
          return NextResponse.next();
        }
      } catch {
        // token manipulado o no firmado por nosotros
      }
    }

    return redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};