import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
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

      // 도메인 제한: @saerom.hs.kr 만 허용
      if (!user?.email || !user.email.endsWith("@saerom.hs.kr")) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/?error=domain`);
      }

      const serviceClient = await createServiceClient();

      // 1. 프로필 조회 및 ID 동기화
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();

      if (profile) {
        if (profile.id !== user.id) {
          await serviceClient
            .from("profiles")
            .update({ id: user.id })
            .eq("email", user.email);
        }
      } else {
        // 2. 가입 요청 생성 (등록되지 않은 유저인 경우)
        const { data: existingReq } = await serviceClient
          .from("registration_requests")
          .select("id")
          .eq("email", user.email)
          .maybeSingle();
        if (!existingReq) {
          const userName =
            user.user_metadata?.full_name || user.email.split("@")[0];
          await serviceClient
            .from("registration_requests")
            .insert({ email: user.email, name: userName, status: "pending" });
        }
      }

      // [핵심] 성공 시 보따리에 들어있던 원래 목적지(?seat=... 포함)로 이동
      const response = NextResponse.redirect(`${origin}${next}`, {
        status: 303,
      });
      response.headers.set("Cache-Control", "no-store, max-age=0");
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}
