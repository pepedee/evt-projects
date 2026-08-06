import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Reachable without a session; pointless with one.
 *
 * /demo is included even though it postdates the original auth build — it's
 * a fixture-only showcase with no database calls, meant to be reviewable
 * without signing in.
 */
const PUBLIC_PATHS = ["/login", "/register", "/demo"];

/**
 * Auth machinery (sign-out, callbacks). Always allowed and never redirected —
 * bouncing a signed-in user away from /auth/signout would make signing out
 * impossible.
 */
const AUTH_ROUTES = ["/auth"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Email confirmation and password-reset links land here as `?code=...`
  // (Supabase's default template redirects to the bare Site URL, not a
  // dedicated callback path). Exchange it for a session before any of the
  // redirect logic below runs — a Server Component can't set cookies itself,
  // so this is the one place in the app that can turn the code into a
  // signed-in session.
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    const url = request.nextUrl.clone();
    url.pathname = error ? "/login" : "/dashboard";
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    // exchangeCodeForSession's setAll() wrote the new session cookies onto
    // supabaseResponse, not onto this redirect — copy them across explicitly
    // rather than trust header-merging to carry Set-Cookie correctly.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (AUTH_ROUTES.some((path) => pathname.startsWith(path))) {
    return supabaseResponse;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath && pathname !== "/demo") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
