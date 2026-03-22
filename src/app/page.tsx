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

// --- Main Content Component ---
function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get("error");

  // [중요] supabase 인스턴스 안정화 - 리렌더링 시 재생성 방지
  const supabase = useMemo(() => createClient(), []);

  const [authState, setAuthState] = useState<AuthState>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ─── 인증 확인 및 프로필 조회 ──────────────────────────────────────────
  const checkAuth = useCallback(async () => {
    console.log("System: Starting Auth Check...");
    try {
      // 1. 세션 및 유저 정보 확인
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        console.log("System: No Active Session");
        setAuthState("guest");
        return;
      }

      const email = user.email!;
      setUserEmail(email);

      // 2. 프로필 테이블 조회 (maybeSingle로 406 에러 방지)
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (profileData) {
        console.log("System: Profile Found -", profileData.name);
        // ID 동기화가 필요한 경우 처리
        if (profileData.id !== user.id) {
          await supabase
            .from("profiles")
            .update({ id: user.id })
            .eq("email", email);
        }
        setProfile(profileData as Profile);
        setAuthState("active");
        return;
      }

      // 3. 프로필이 없으면 가입 요청 테이블 확인
      const { data: reqData } = await supabase
        .from("registration_requests")
        .select("status")
        .eq("email", email)
        .maybeSingle();

      if (reqData) {
        setAuthState(reqData.status === "rejected" ? "rejected" : "pending");
      } else {
        // 둘 다 없으면 기본적으로 승인 대기 상태로 간주 (방금 가입 요청이 들어간 경우)
        setAuthState("pending");
      }
    } catch (err) {
      console.error("System Error: Auth Logic Failed", err);
      setAuthState("guest");
    }
  }, [supabase]);

  // ─── 초기 마운트 및 인증 이벤트 리스너 ────────────────────────────────
  useEffect(() => {
    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      console.log("Auth Event Triggered:", event);
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        checkAuth();
        router.refresh();
      } else if (event === "SIGNED_OUT") {
        setAuthState("guest");
        setProfile(null);
        setUserEmail(null);
        router.refresh();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, checkAuth, router]);

  // ─── 실시간 승인 감시 (Profiles INSERT 감지) ───────────────────────
  // page.tsx의 useEffect 부분
  useEffect(() => {
    // authState가 'pending'일 때만 실시간 승인 감시 시작
    if (authState !== "pending" || !userEmail) return;

    const channel = supabase
      .channel("approval-check")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profiles",
          filter: `email=eq.${userEmail}`, // 내 이메일로 프로필이 생성되는지 감시
        },
        (payload) => {
          console.log("승인 확인됨:", payload);
          // 프로필이 생성되면 다시 인증 체크를 실행하여 'active' 상태로 전환
          checkAuth();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authState, userEmail, supabase, checkAuth]);

  // ─── 핸들러 ──────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: "saerom.hs.kr",
          prompt: "select_account",
        },
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = window.location.origin;
  };

  // ─── Loading State UI ──────────────────────────────────────────
  if (authState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <Loader2 className="w-12 h-12 text-accent-blue animate-spin" />
            <div className="absolute inset-0 blur-lg bg-accent-blue/20 animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-text-primary font-bold tracking-widest text-sm uppercase">
              Initializing System
            </p>
            <p className="text-text-muted text-[10px] animate-pulse">
              Checking Security Protocol...
            </p>
          </div>
        </motion.div>
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

  // ─── Main Content UI ──────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-bg-primary text-text-primary">
      {/* HUD Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-purple/10 rounded-full blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md px-6 flex flex-col items-center gap-8"
      >
        {/* Logo Section */}
        <div className="text-center space-y-4">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center mx-auto glow-blue"
          >
            <Vote className="w-10 h-10 text-white" />
          </motion.div>
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter gradient-text">
              대위원회
            </h1>
            <p className="text-text-secondary text-xs font-medium tracking-widest uppercase opacity-70">
              Student Delegate System
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* 1. ACTIVE STATE (Logged In) */}
          {authState === "active" && profile && (
            <motion.div
              key="active"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full space-y-4"
            >
              <div className="glass rounded-2xl p-6 border border-white/5 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
                  <ShieldCheck className="w-12 h-12 text-accent-blue" />
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xl font-bold">{profile.name}</span>
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-bold border ${roleColors[profile.role]} uppercase tracking-wider`}
                  >
                    {roleLabels[profile.role]}
                  </span>
                </div>
                <div className="space-y-2 text-sm text-text-secondary">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-3.5 h-3.5 text-accent-blue/60" />
                    <span>{profile.email}</span>
                  </div>
                  {profile.assigned_seat && (
                    <div className="flex items-center gap-2.5">
                      <User className="w-3.5 h-3.5 text-accent-cyan/60" />
                      <span>
                        배정 좌석:{" "}
                        <b className="text-text-primary">
                          {profile.assigned_seat}
                        </b>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <motion.a
                href={navConfig[profile.role].href}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-accent-blue to-accent-cyan text-white font-bold text-lg glow-blue flex items-center justify-center gap-3 no-underline block text-center"
              >
                {navConfig[profile.role].icon}
                {navConfig[profile.role].label}
              </motion.a>

              <button
                onClick={handleLogout}
                className="w-full py-3 text-text-muted text-xs font-medium hover:text-text-primary transition-colors flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" /> 시스템 로그아웃
              </button>
            </motion.div>
          )}

          {/* 2. PENDING STATE (Wait for Approval) */}
          {authState === "pending" && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-4"
            >
              <div className="glass-strong rounded-3xl p-8 text-center space-y-4 border border-accent-amber/20">
                <div className="relative mx-auto w-16 h-16">
                  <Clock className="w-16 h-16 text-accent-amber animate-pulse" />
                  <div className="absolute inset-0 bg-accent-amber/20 blur-xl animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-accent-amber uppercase tracking-tight">
                    Access Pending
                  </h3>
                  <p className="text-text-secondary text-sm leading-relaxed">
                    가입 요청이 관리자에게 전달되었습니다.
                    <br />
                    승인 즉시 자동으로 대시보드가 활성화됩니다.
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

          {/* 3. REJECTED STATE */}
          {authState === "rejected" && (
            <motion.div
              key="rejected"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full space-y-4"
            >
              <div className="p-6 rounded-2xl bg-accent-red/10 border border-accent-red/20 text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-accent-red mx-auto" />
                <p className="text-accent-red font-bold">
                  접근 권한이 거절되었습니다.
                </p>
                <p className="text-text-secondary text-xs">
                  관리자에게 문의하시기 바랍니다.
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full py-3 glass rounded-2xl text-text-muted text-xs"
              >
                시스템 로그아웃
              </button>
            </motion.div>
          )}

          {/* 4. GUEST STATE (Login Button) */}
          {authState === "guest" && (
            <motion.div
              key="guest"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-6"
            >
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red text-[11px] font-medium justify-center">
                  <AlertCircle className="w-3.5 h-3.5" /> 인증 과정에서 오류가
                  발생했습니다.
                </div>
              )}

              <div className="space-y-4">
                <motion.button
                  whileHover={{
                    scale: 1.02,
                    boxShadow: "0 0 20px rgba(255,255,255,0.1)",
                  }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGoogleLogin}
                  className="w-full py-4 px-6 rounded-2xl bg-white text-black font-bold text-lg flex items-center justify-center gap-3 cursor-pointer shadow-xl transition-all"
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
                  Google 계정으로 로그인
                </motion.button>
                <div className="text-center">
                  <p className="text-[10px] text-text-muted font-medium tracking-tight">
                    @saerom.hs.kr 도메인 계정 전용
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// --- Wrapper with Suspense ---
export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <HomeContent />
    </Suspense>
  );
}
