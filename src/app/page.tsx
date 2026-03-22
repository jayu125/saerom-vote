"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import {
  Vote,
  LogOut,
  LayoutDashboard,
  Radio,
  Users,
  Clock,
  Mail,
  User,
  Loader2,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

interface Profile {
  id: string;
  email: string;
  name: string;
  student_id: string;
  role: "admin" | "facilitator" | "attendee";
  assigned_seat: string;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const nextPath = searchParams.get("next"); // 리다이렉트 경로 감지

  const supabase = useMemo(() => createClient(), []);
  const [authState, setAuthState] = useState<
    "loading" | "guest" | "active" | "pending"
  >("loading");
  const [profile, setProfile] = useState<Profile | null>(null);

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
      // ID 동기화
      if (profileData.id !== user.id) {
        await supabase
          .from("profiles")
          .update({ id: user.id })
          .eq("email", user.email!);
      }
      setProfile(profileData as Profile);
      setAuthState("active");

      // [핵심] 가려던 곳(nextPath)이 있다면 즉시 이동
      if (nextPath) {
        router.replace(decodeURIComponent(nextPath));
      }
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
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: "saerom.hs.kr", prompt: "select_account" },
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-bg-primary text-text-primary">
      <div className="relative z-10 w-full max-w-md px-6 flex flex-col items-center gap-8">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center mx-auto glow-blue">
            <Vote className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black gradient-text uppercase">
            Saerom Voting
          </h1>
        </div>

        <AnimatePresence mode="wait">
          {authState === "active" && profile && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-4"
            >
              <div className="glass rounded-2xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xl font-bold font-sans">
                    {profile.name}
                  </span>
                  <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-accent-blue/20 text-accent-blue font-sans uppercase">
                    {profile.role}
                  </span>
                </div>
                <p className="text-xs text-text-secondary font-sans">
                  {profile.email}
                </p>
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
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-accent-blue to-accent-cyan text-white font-bold text-lg font-sans shadow-lg"
              >
                시스템 입장하기
              </button>

              <button
                onClick={handleLogout}
                className="w-full py-3 text-text-muted text-xs font-sans hover:text-text-primary"
              >
                로그아웃
              </button>
            </motion.div>
          )}

          {authState === "guest" && (
            <button
              onClick={handleGoogleLogin}
              className="w-full py-4 rounded-2xl bg-white text-black font-bold text-lg flex items-center justify-center gap-3 font-sans transition-transform active:scale-95"
            >
              Google 계정 로그인
            </button>
          )}

          {authState === "pending" && (
            <div className="glass-strong rounded-3xl p-8 text-center space-y-4 border border-accent-amber/20 font-sans">
              <Clock className="w-12 h-12 text-accent-amber animate-pulse mx-auto" />
              <h3 className="text-lg font-bold text-accent-amber">
                승인 대기 중
              </h3>
              <p className="text-xs text-text-secondary">
                관리자의 승인을 기다리고 있습니다.
              </p>
              <button
                onClick={handleLogout}
                className="w-full py-2 text-xs text-text-muted font-sans"
              >
                다른 계정 로그인
              </button>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <HomeContent />
    </Suspense>
  );
}
