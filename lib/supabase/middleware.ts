import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Sign-in screens. Reachable without a session; pointless with one. */
const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Always allowed, never redirected in either direction.
 *
 * `/auth` is auth machinery — bouncing a signed-in user away from
 * /auth/signout would make signing out impossible.
 *
 * `/demo` is a static UI showcase built from fixture data. It touches no
 * database and holds no real record, so it is safe to leave open. Delete the
 * route and this entry together when it has served its purpose.
 */
const ALWAYS_ALLOWED = ["/auth", "/demo"];

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (ALWAYS_ALLOWED.some((path) => pathname.startsWith(path))) {
    return supabaseResponse;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
