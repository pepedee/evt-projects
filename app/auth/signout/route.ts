import { NextResponse, type NextRequest } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";

/** POST target for the sign-out button in the topbar. */
export async function POST(request: NextRequest) {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 so the browser follows with GET rather than repeating the POST.
    status: 303,
  });
}
