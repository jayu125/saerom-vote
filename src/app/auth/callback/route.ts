import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server"; // 이전에 만든 헬퍼 사용

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {
              /* Server Component context */
            }
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/?error=auth`);
      }

      // 도메인 체크
      if (!user.email.endsWith("@saerom.hs.kr")) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/?error=domain`);
      }

      const serviceClient = await createServiceClient();

      // 1. 프로필 조회 (이메일 기준)
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("id, role")
        .eq("email", user.email)
        .maybeSingle(); // single() 대신 maybeSingle()로 에러 방지

      if (profile) {
        // 관리자 ID 동기화 (SQL로 미리 넣은 id와 Google id가 다를 수 있음)
        if (profile.id !== user.id) {
          await serviceClient
            .from("profiles")
            .update({ id: user.id })
            .eq("email", user.email);
        }

        // 중요: 세션 쿠키가 브라우저에 확실히 반영되도록 리다이렉트
        const response = NextResponse.redirect(`${origin}/`, {
          status: 303, // See Other: POST 요청 후 리다이렉트 시 권장되는 상태 코드
        });

        // 클라이언트 사이드 캐시를 강제로 무효화하도록 지시
        response.headers.set("Cache-Control", "no-store, max-age=0");
        return response;
      }

      // 2. 가입 요청 확인 및 생성
      const { data: existingRequest } = await serviceClient
        .from("registration_requests")
        .select("id, status")
        .eq("email", user.email)
        .maybeSingle();

      if (!existingRequest) {
        const userName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email.split("@")[0];
        await serviceClient.from("registration_requests").insert({
          email: user.email,
          name: userName,
          status: "pending",
        });
      }

      const response = NextResponse.redirect(`${origin}/`);
      response.headers.set("Cache-Control", "no-store, max-age=0");
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
