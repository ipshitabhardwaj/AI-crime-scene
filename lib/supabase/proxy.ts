import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { PROTECTED_AREAS, ROLE_HOME, type AppRole } from "@/lib/constants";

/**
 * Runs before every page request:
 * 1. refreshes the Supabase session cookie,
 * 2. sends people to the right area for their role.
 * Pages re-check the role against the database (lib/auth.ts), so this is
 * routing convenience, not the security boundary. RLS is the boundary.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("YOUR-PROJECT")) {
    return new NextResponse(
      "Supabase is not configured.\n\n" +
        "1. Create .env.local in the project folder (copy .env.example).\n" +
        "2. Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY\n" +
        "   from Supabase dashboard -> Project Settings -> API.\n" +
        "3. Stop and restart `npm run dev` (env files are read only at startup).",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims().
  // getClaims() refreshes an expiring session and verifies the JWT
  // (locally with asymmetric signing keys, otherwise via the Auth server).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const user = claims?.sub ? claims : null;

  const path = request.nextUrl.pathname;
  const role = ((claims?.app_metadata as { role?: string } | undefined)?.role ?? null) as AppRole | null;

  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const r = NextResponse.redirect(url);
    // keep any refreshed auth cookies
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  // Logged-in users hitting the login page go to their home area.
  if (path === "/" && user && role) return redirectTo(ROLE_HOME[role]);

  const area = PROTECTED_AREAS.find((a) => path === a.prefix || path.startsWith(a.prefix + "/"));
  if (area) {
    if (!user) return redirectTo("/");
    if (role !== area.role) return redirectTo(role ? ROLE_HOME[role] : "/");
  }

  return response;
}
