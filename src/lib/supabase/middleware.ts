import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// ... (기존 상단 import 동일)

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
  const pathname = request.nextUrl.pathname;

  // 공개 경로는 검사 생략
  if (
    pathname === "/" ||
    pathname === "/auth/callback" ||
    pathname === "/screen" ||
    pathname.startsWith("/api/")
  ) {
    return supabaseResponse;
  }

  if (!user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 역할 기반 접근 제어
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();

  if (!profile) {
    // 프로필이 없는 유저는 오직 홈 페이지만 허용
    return NextResponse.redirect(new URL("/", request.url));
  }

  const role = profile.role;
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (
    pathname.startsWith("/remote") &&
    role !== "admin" &&
    role !== "facilitator"
  ) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}
