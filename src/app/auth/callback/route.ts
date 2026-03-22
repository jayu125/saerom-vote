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
      if (!user?.email || !user.email.endsWith("@saerom.hs.kr")) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/?error=domain`);
      }

      const serviceClient = await createServiceClient();
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();

      if (!profile) {
        const { data: existingReq } = await serviceClient
          .from("registration_requests")
          .select("id")
          .eq("email", user.email)
          .maybeSingle();
        if (!existingReq) {
          const userName =
            user.user_metadata?.full_name || user.email.split("@")[0];
          await serviceClient.from("registration_requests").insert({
            email: user.email,
            name: userName,
            status: "pending",
          });
        }
      }

      const response = NextResponse.redirect(`${origin}${next}`, {
        status: 303,
      });
      response.headers.set("Cache-Control", "no-store, max-age=0");
      return response;
    }
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
