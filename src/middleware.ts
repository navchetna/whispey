import { NextRequest, NextResponse } from 'next/server';
import { getUserBySession } from './lib/auth';

// Define which routes are public (don't require authentication)
const publicRoutes = [
  '/sign-in',
  '/sign-up',
  '/terms-of-service',
  '/privacy-policy',
  '/docs',
  '/api/auth', // Authentication API routes
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check if route is public
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));
  
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check for session token in cookies
  const sessionToken = request.cookies.get('session_token')?.value;

  if (!sessionToken) {
    // Redirect to sign-in if no token
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  try {
    // Validate session token
    const user = await getUserBySession(sessionToken);
    
    if (!user) {
      // Invalid or expired token, redirect to sign-in
      const response = NextResponse.redirect(new URL('/sign-in', request.url));
      response.cookies.delete('session_token');
      return response;
    }

    // Add user info to request headers for use in API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', user.id);
    requestHeaders.set('x-user-email', user.email);
    requestHeaders.set('x-user-admin', user.isAdmin.toString());

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (error) {
    console.error('Middleware authentication error:', error);
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};