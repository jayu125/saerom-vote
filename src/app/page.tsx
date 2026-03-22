"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Vote,
  LogOut,
  LayoutDashboard,
  Radio,
  Users,
  Clock,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextPath = searchParams.get("next");

  const supabase = useMemo(() => createClient(), []);
  const [authState, setAuthState] = useState<
    "loading" | "guest" | "active" | "pending"
  >("loading");
  const [profile, setProfile] = useState<any>(null);

  const checkAuth = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAuthState("guest");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", user.email!)
      .maybeSingle();

    if (profileData) {
      if (profileData.id !== user.id) {
        await supabase
          .from("profiles")
          .update({ id: user.id })
          .eq("email", user.email!);
      }
      setProfile(profileData);
      setAuthState("active");
      if (nextPath) router.replace(decodeURIComponent(nextPath));
    } else {
      const { data: reqData } = await supabase
        .from("registration_requests")
        .select("status")
        .eq("email", user.email!)
        .maybeSingle();
      setAuthState(reqData ? "pending" : "guest");
    }
  }, [supabase, router, nextPath]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleGoogleLogin = async () => {
    // [핵심] redirectTo 경로 뒤에 보따리(next)를 다시 붙여서 구글로 보냄
    const redirectTo = `${window.location.origin}/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { hd: "saerom.hs.kr", prompt: "select_account" },
      },
    });
  };

  if (authState === "loading")
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070A]">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#05070A] text-white p-6">
      <div className="w-full max-w-md text-center space-y-8">
        <Vote className="w-16 h-16 mx-auto text-blue-500" />
        <h1 className="text-4xl font-black uppercase tracking-tighter">
          Saerom Voting
        </h1>

        <AnimatePresence mode="wait">
          {authState === "active" && profile && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-left">
                <p className="text-xl font-bold">{profile.name}</p>
                <p className="text-xs opacity-50">{profile.email}</p>
              </div>
              <button
                onClick={() => {
                  const url = nextPath
                    ? decodeURIComponent(nextPath)
                    : profile.role === "admin"
                      ? "/admin"
                      : "/meeting";
                  router.push(url);
                }}
                className="w-full py-4 rounded-2xl bg-blue-600 font-bold text-lg flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                시스템 입장하기 <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
                className="text-xs opacity-30 hover:opacity-100 cursor-pointer transition-opacity"
              >
                로그아웃
              </button>
            </motion.div>
          )}

          {authState === "guest" && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={handleGoogleLogin}
              className="w-full py-4 rounded-2xl bg-white text-black font-bold text-lg flex items-center justify-center gap-3 cursor-pointer shadow-xl"
            >
              Google 계정 로그인
            </motion.button>
          )}

          {authState === "pending" && (
            <div className="p-8 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
              <Clock className="w-12 h-12 mx-auto mb-4 animate-pulse" />
              <h3 className="font-bold">승인 대기 중</h3>
              <p className="text-xs opacity-70">
                관리자가 승인하면 자동으로 입장 가능합니다.
              </p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
