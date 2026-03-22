"use client";

import { useEffect, useState, useCallback, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Vote,
  LogOut,
  Radio,
  Users,
  Clock,
  Mail,
  User,
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
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAuthState("guest");
      return;
    }

    const email = user.email!;
    setUserEmail(email);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (profileData) {
      if (profileData.id !== user.id) {
        await supabase
          .from("profiles")
          .update({ id: user.id })
          .eq("email", email);
      }
      setProfile(profileData);
      setAuthState("active");
      if (nextPath) router.replace(decodeURIComponent(nextPath));
    } else {
      const { data: reqData } = await supabase
        .from("registration_requests")
        .select("status")
        .eq("email", email)
        .maybeSingle();
      setAuthState(reqData ? "pending" : "pending");
    }
  }, [supabase, router, nextPath]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 관리자 승인 실시간 감시 (INSERT 감지 시 즉시 페이지 갱신)
  useEffect(() => {
    if (authState !== "pending" || !userEmail) return;
    const channel = supabase
      .channel(`sync:${userEmail}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profiles",
          filter: `email=eq.${userEmail}`,
        },
        () => {
          window.location.reload();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [authState, userEmail, supabase]);

  const handleGoogleLogin = async () => {
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
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#05070A] text-white font-sans">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:40px_40px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md px-6 flex flex-col items-center gap-8"
      >
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(6,182,212,0.3)]">
            <Vote className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tighter uppercase">
            Saerom Voting
          </h1>
        </div>

        <AnimatePresence mode="wait">
          {authState === "active" && profile && (
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-4"
            >
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xl font-bold">{profile.name}</span>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 uppercase">
                    {profile.role}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3" /> {profile.email}
                  </div>
                  {profile.assigned_seat && (
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3" /> 좌석:{" "}
                      <b className="text-white">{profile.assigned_seat}</b>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  const url = nextPath
                    ? decodeURIComponent(nextPath)
                    : profile.role === "admin"
                      ? "/admin"
                      : profile.role === "facilitator"
                        ? "/remote"
                        : "/meeting";
                  router.push(url);
                }}
                className="w-full py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
              >
                시스템 입장 <ChevronRight className="w-5 h-5" />
              </button>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
                className="w-full py-3 text-xs text-slate-500 hover:text-white transition-colors cursor-pointer"
              >
                로그아웃
              </button>
            </motion.div>
          )}

          {authState === "guest" && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleGoogleLogin}
              className="w-full py-4 rounded-2xl bg-white text-black font-bold text-lg flex items-center justify-center gap-3 cursor-pointer shadow-xl"
            >
              Google 계정 로그인
            </motion.button>
          )}

          {authState === "pending" && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-4"
            >
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-3xl p-8 text-center space-y-4 backdrop-blur-xl">
                <Clock className="w-12 h-12 text-amber-500 animate-pulse mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-amber-500 uppercase tracking-tight">
                    Access Pending
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    관리자가 가입 요청을 확인 중이에요.
                    <br />
                    승인 시 화면이 자동으로 전환됩니다.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
                className="w-full py-3 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                다른 계정 로그인
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
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
