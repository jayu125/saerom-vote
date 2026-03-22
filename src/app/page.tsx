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
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

// --- Types ---
interface Profile {
  id: string;
  email: string;
  name: string;
  student_id: string;
  role: "admin" | "facilitator" | "attendee";
  assigned_seat: string;
}

type AuthState = "loading" | "guest" | "active" | "pending" | "rejected";

const roleLabels: Record<Profile["role"], string> = {
  admin: "관리자",
  facilitator: "진행자",
  attendee: "참석자",
};

const roleColors: Record<Profile["role"], string> = {
  admin: "bg-accent-amber/15 text-accent-amber border-accent-amber/30",
  facilitator: "bg-accent-purple/15 text-accent-purple border-accent-purple/30",
  attendee: "bg-accent-blue/15 text-accent-blue border-accent-blue/30",
};

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");

  const supabase = useMemo(() => createClient(), []);

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ─── 인증 확인 및 프로필 동기화 ──────────────────────────────────────────
  const checkAuth = useCallback(async () => {
    console.log("System: Authenticating...");
    try {
      // 1. 유저 세션 확인
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        setAuthState("guest");
        return;
      }

      const email = user.email!;
      setUserEmail(email);

      // 2. 프로필 조회 (이메일 기반 - RLS가 허용하도록 수정됨)
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (profileData) {
        console.log("System: Profile Linked -", profileData.name);

        // ID 동기화 (최초 1회 실행)
        if (profileData.id !== user.id) {
          console.log("System: Syncing UID...");
          await supabase
            .from("profiles")
            .update({ id: user.id })
            .eq("email", email);
        }

        setProfile(profileData as Profile);
        setAuthState("active");
        router.refresh(); // 서버 데이터 동기화
        return;
      }

      // 3. 가입 대기 상태 확인
      const { data: reqData } = await supabase
        .from("registration_requests")
        .select("status")
        .eq("email", email)
        .maybeSingle();

      if (reqData) {
        setAuthState(reqData.status === "rejected" ? "rejected" : "pending");
      } else {
        setAuthState("pending");
      }
    } catch (err) {
      console.error("System Critical Error:", err);
      setAuthState("guest");
    }
  }, [supabase, router]);

  // ─── 인증 이벤트 감시 ────────────────────────────────
  useEffect(() => {
    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        checkAuth();
      } else if (event === "SIGNED_OUT") {
        setAuthState("guest");
        setProfile(null);
        setUserEmail(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, checkAuth]);

  // ─── 실시간 승인 감시 (핵심: 브라우저 강제 새로고침 적용) ──────────────────
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
          console.log("System: Admin Approved Access. Reloading...");
          // 가장 확실한 방법: 페이지 전체 리로드
          window.location.reload();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authState, userEmail, supabase]);

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
    window.location.href = window.location.origin;
  };

  // ─── UI 렌더링 ──────────────────────────────────────────
  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
      </div>
    );
  }

  const navConfig: Record<
    Profile["role"],
    { label: string; href: string; icon: React.ReactNode }
  > = {
    admin: {
      label: "관리자 대시보드",
      href: "/admin",
      icon: <LayoutDashboard className="w-5 h-5" />,
    },
    facilitator: {
      label: "진행 페이지",
      href: "/remote",
      icon: <Radio className="w-5 h-5" />,
    },
    attendee: {
      label: "회의 참가",
      href: `/meeting?seat=${profile?.assigned_seat ?? ""}`,
      icon: <Users className="w-5 h-5" />,
    },
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-bg-primary text-text-primary">
      {/* Background Elements */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md px-6 flex flex-col items-center gap-8"
      >
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ repeat: Infinity, duration: 6 }}
            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center mx-auto glow-blue"
          >
            <Vote className="w-10 h-10 text-white" />
          </motion.div>
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter gradient-text uppercase">
              Saerom Voting
            </h1>
            <p className="text-text-secondary text-[10px] font-bold tracking-[0.2em] uppercase opacity-50">
              Precision Delegate System
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {authState === "active" && profile && (
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-4"
            >
              <div className="glass rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xl font-bold">{profile.name}</span>
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border ${roleColors[profile.role]} uppercase`}
                  >
                    {roleLabels[profile.role]}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-text-secondary">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3 h-3 opacity-50" />
                    {profile.email}
                  </div>
                  {profile.assigned_seat && (
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 opacity-50" />
                      좌석:{" "}
                      <b className="text-text-primary">
                        {profile.assigned_seat}
                      </b>
                    </div>
                  )}
                </div>
              </div>

              <motion.a
                href={navConfig[profile.role].href}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-accent-blue to-accent-cyan text-white font-bold text-lg flex items-center justify-center gap-3 no-underline shadow-lg"
              >
                {navConfig[profile.role].icon}
                {navConfig[profile.role].label}
              </motion.a>
              <button
                onClick={handleLogout}
                className="w-full py-3 text-text-muted text-xs hover:text-text-primary transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-3 h-3" /> 시스템 로그아웃
              </button>
            </motion.div>
          )}

          {authState === "pending" && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-4"
            >
              <div className="glass-strong rounded-3xl p-8 text-center space-y-4 border border-accent-amber/20">
                <Clock className="w-12 h-12 text-accent-amber animate-pulse mx-auto" />
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-accent-amber uppercase tracking-tight">
                    Access Pending
                  </h3>
                  <p className="text-text-secondary text-xs leading-relaxed">
                    가입 요청이 승인 대기 중입니다. <br /> 관리자가 승인하면
                    자동으로 화면이 전환됩니다.
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-3 glass rounded-2xl text-text-muted text-xs hover:text-text-primary transition-colors"
              >
                다른 계정으로 로그인
              </button>
            </motion.div>
          )}

          {authState === "guest" && (
            <motion.div
              key="guest"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-4"
            >
              <button
                onClick={handleGoogleLogin}
                className="w-full py-4 rounded-2xl bg-white text-black font-bold text-lg flex items-center justify-center gap-3 shadow-xl transition-transform active:scale-95 cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google 계정 로그인
              </button>
              <p className="text-[10px] text-center text-text-muted font-medium">
                @saerom.hs.kr 도메인 전용
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
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
