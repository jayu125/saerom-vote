"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  Suspense,
} from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import type { Phase, MeetingState, Agenda, Profile } from "@/lib/types";
import { initPdfWorker } from "@/lib/pdf-utils";
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Check,
  Shield,
  Vote,
  Loader2,
  LogOut,
  ZoomIn,
  ZoomOut,
  Maximize,
  FileText,
  Timer,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { usePresence } from "@/components/SeatMap";

/** Precision HUD Animations */
const HUD_SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };
const DOCK_SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };
const DOCK_TAP = { type: "spring" as const, stiffness: 500, damping: 35 };

function MeetingContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const seatParam = searchParams.get("seat");

  // --- State Management ---
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meetingState, setMeetingState] = useState<MeetingState | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [hasAskedQuestion, setHasAskedQuestion] = useState(false);
  const [voting, setVoting] = useState(false);
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [voteSuccess, setVoteSuccess] = useState<"PRO" | "CON" | null>(null);
  const [questionSuccess, setQuestionSuccess] = useState(false);
  const [questionMemo, setQuestionMemo] = useState("");
  const [showMemoInput, setShowMemoInput] = useState(false);
  const [showConReasonSheet, setShowConReasonSheet] = useState(false);
  const [conReason, setConReason] = useState("");

  // --- PDF & Zoom Refs ---
  const pdfDocRef = useRef<any>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [scale, setScale] = useState(1);
  const [pageBaseDims, setPageBaseDims] = useState<{ w: number; h: number }[]>(
    [],
  );

  const pinchRef = useRef({ dist: 0, scale: 1 });
  const zoomPosRef = useRef({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
    scaleAtStart: 1,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dockShake = useAnimation();
  const prevQuestionSuccess = useRef(false);
  const prevVoteSuccess = useRef<"PRO" | "CON" | null>(null);
  const phase: Phase = meetingState?.phase ?? "IDLE";

  // --- Auth & Initial Logic ---
  useEffect(() => {
    if (phase === "ENDED") {
      router.replace("/meeting/closed");
    }
  }, [phase, router]);

  usePresence("saerom-presence", profile?.id);

  // 시각적 피드백 (진동 효과)
  useEffect(() => {
    if (questionSuccess && !prevQuestionSuccess.current) {
      void dockShake.start({
        x: [0, -3, 3, -2, 2, 0],
        transition: { duration: 0.38, times: [0, 0.15, 0.35, 0.55, 0.75, 1] },
      });
    }
    prevQuestionSuccess.current = questionSuccess;
  }, [questionSuccess, dockShake]);

  useEffect(() => {
    if (voteSuccess !== null && prevVoteSuccess.current === null) {
      void dockShake.start({
        x: [0, -4, 4, -2, 2, 0],
        transition: { duration: 0.4, times: [0, 0.15, 0.35, 0.55, 0.75, 1] },
      });
    }
    prevVoteSuccess.current = voteSuccess;
  }, [voteSuccess, dockShake]);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/");
        return;
      }

      let { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileData) {
        const { data: byEmail } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", user.email!)
          .maybeSingle();
        if (byEmail) {
          await supabase
            .from("profiles")
            .update({ id: user.id })
            .eq("email", user.email!);
          profileData = { ...byEmail, id: user.id };
        }
      }

      if (!profileData) {
        setAuthError("등록되지 않은 사용자입니다.");
        setLoading(false);
        return;
      }

      const p = profileData as Profile;
      if (seatParam && p.assigned_seat !== seatParam) {
        setAuthError("배정된 좌석이 아닙니다.");
        setLoading(false);
        return;
      }

      setProfile(p);
      const { data: msData } = await supabase
        .from("meeting_state")
        .select("*")
        .maybeSingle();
      if (msData) setMeetingState(msData as MeetingState);
      setLoading(false);
    }
    init();
  }, [supabase, seatParam, router]);

  // --- Data Fetching ---
  const fetchAgenda = useCallback(
    async (agendaId: string) => {
      const { data } = await supabase
        .from("agendas")
        .select("*")
        .eq("id", agendaId)
        .maybeSingle();
      if (data) setAgenda(data as Agenda);
    },
    [supabase],
  );

  useEffect(() => {
    if (meetingState?.current_agenda_id)
      fetchAgenda(meetingState.current_agenda_id);
  }, [meetingState?.current_agenda_id, fetchAgenda]);

  const checkVoteStatus = useCallback(async () => {
    if (!profile || !meetingState?.current_agenda_id) return;
    const { data } = await supabase
      .from("votes")
      .select("id")
      .eq("agenda_id", meetingState.current_agenda_id)
      .eq("user_id", profile.id)
      .maybeSingle();
    setHasVoted(!!data);
  }, [supabase, profile, meetingState?.current_agenda_id]);

  const checkQuestionStatus = useCallback(async () => {
    if (!profile || !meetingState?.current_agenda_id) return;
    const { data } = await supabase
      .from("questions")
      .select("id")
      .eq("agenda_id", meetingState.current_agenda_id)
      .eq("user_id", profile.id)
      .in("status", ["waiting", "speaking"])
      .maybeSingle();
    const active = !!data;
    setHasAskedQuestion(active);
    if (!active) setQuestionSuccess(false);
  }, [supabase, profile, meetingState?.current_agenda_id]);

  useEffect(() => {
    if (phase === "VOTING") {
      checkVoteStatus();
      setVoteSuccess(null);
    } else {
      setShowConReasonSheet(false);
      setConReason("");
    }
  }, [phase, checkVoteStatus]);

  useEffect(() => {
    if (phase === "IDLE" || phase === "QA" || phase === "INTRO") {
      checkQuestionStatus();
      setQuestionSuccess(false);
      setShowMemoInput(false);
      setQuestionMemo("");
    }
  }, [phase, checkQuestionStatus]);

  // --- Real-time & Timer ---
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!meetingState?.timer_end_at) {
      setTimerSeconds(null);
      return;
    }
    const calc = () => {
      const diff = Math.max(
        0,
        Math.ceil(
          (new Date(meetingState.timer_end_at!).getTime() - Date.now()) / 1000,
        ),
      );
      setTimerSeconds(diff);
    };
    calc();
    timerRef.current = setInterval(calc, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [meetingState?.timer_end_at]);

  useEffect(() => {
    const channel = supabase
      .channel("attendee-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_state" },
        (payload) => {
          if (payload.new) setMeetingState(payload.new as MeetingState);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions" },
        () => {
          void checkQuestionStatus();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, checkQuestionStatus]);

  // --- PDF Rendering ---
  function destroyPdf() {
    if (pdfDocRef.current) {
      pdfDocRef.current.destroy();
      pdfDocRef.current = null;
    }
  }

  useEffect(() => {
    if (!agenda?.pdf_url) {
      destroyPdf();
      setNumPages(0);
      setPdfError(false);
      setPageBaseDims([]);
      return;
    }
    let cancelled = false;
    async function loadDocument() {
      destroyPdf();
      setPdfLoading(true);
      setPdfError(false);
      try {
        const pdfjsLib = await initPdfWorker();
        if (!pdfjsLib) throw new Error("PDF worker unavailable");
        const res = await fetch(agenda!.pdf_url!);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setScale(1);
      } catch (err) {
        if (!cancelled) setPdfError(true);
      }
      if (!cancelled) setPdfLoading(false);
    }
    loadDocument();
    return () => {
      cancelled = true;
    };
  }, [agenda?.pdf_url]);

  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;
    let cancelled = false;
    async function renderAll() {
      const pdf = pdfDocRef.current;
      const container = scrollRef.current;
      if (!pdf || !container) return;
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;
      const containerWidth = container.clientWidth;
      const dims: { w: number; h: number }[] = [];
      for (let i = 0; i < numPages; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas || cancelled) continue;
        const page = await pdf.getPage(i + 1);
        const raw = page.getViewport({ scale: 1 });
        const fitScale = (containerWidth * 0.94) / raw.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const viewport = page.getViewport({ scale: fitScale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const baseW = raw.width * fitScale;
        const baseH = raw.height * fitScale;
        canvas.style.width = `${baseW}px`;
        canvas.style.height = `${baseH}px`;
        dims.push({ w: baseW, h: baseH });
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas } as any)
          .promise;
      }
      if (!cancelled) setPageBaseDims(dims);
    }
    renderAll();
    return () => {
      cancelled = true;
    };
  }, [numPages]);

  useEffect(() => {
    for (let i = 0; i < pageBaseDims.length; i++) {
      const canvas = canvasRefs.current[i];
      if (!canvas) continue;
      canvas.style.width = `${pageBaseDims[i].w * scale}px`;
      canvas.style.height = `${pageBaseDims[i].h * scale}px`;
    }
  }, [scale, pageBaseDims]);

  useEffect(() => () => destroyPdf(), []);

  // --- Zoom & Touch Logic (Pivot 보정 포함) ---
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const centerX = (t1.clientX + t2.clientX) / 2;
        const centerY = (t1.clientY + t2.clientY) / 2;

        if (scrollRef.current) {
          const rect = scrollRef.current.getBoundingClientRect();
          zoomPosRef.current = {
            x: centerX - rect.left,
            y: centerY - rect.top,
            scrollLeft: scrollRef.current.scrollLeft,
            scrollTop: scrollRef.current.scrollTop,
            scaleAtStart: scale,
          };
        }
        pinchRef.current = {
          dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
          scale,
        };
      }
    },
    [scale],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && scrollRef.current) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.hypot(
          t2.clientX - t1.clientX,
          t2.clientY - t1.clientY,
        );
        const ratio = dist / pinchRef.current.dist;
        const nextScale = Math.min(
          Math.max(pinchRef.current.scale * ratio, 1),
          5,
        );
        const { x, y, scrollLeft, scrollTop, scaleAtStart } =
          zoomPosRef.current;

        const currentRatio = nextScale / scaleAtStart;
        scrollRef.current.scrollLeft = (scrollLeft + x) * currentRatio - x;
        scrollRef.current.scrollTop = (scrollTop + y) * currentRatio - y;

        setScale(nextScale);
      }
    },
    [scale],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || numPages === 0) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale((s) => Math.min(Math.max(s - e.deltaY * 0.003, 1), 5));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [numPages]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.5, 5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.5, 1));
  const resetZoom = () => {
    setScale(1);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  };

  // --- Handlers ---
  const submitVote = async (choice: "PRO" | "CON", conReasonText?: string) => {
    if (hasVoted || voting || !meetingState?.current_agenda_id) return;
    if (choice === "CON" && !(conReasonText ?? "").trim()) {
      alert("반대 사유를 입력해 주세요.");
      return;
    }
    setShowConReasonSheet(false);
    setVoting(true);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenda_id: meetingState.current_agenda_id,
          choice,
          ...(choice === "CON"
            ? { con_reason: (conReasonText ?? "").trim() }
            : {}),
        }),
      });
      if (res.ok) {
        setHasVoted(true);
        setVoteSuccess(choice);
        setConReason("");
      } else alert("투표 중 오류가 발생했습니다.");
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    }
    setVoting(false);
  };

  const submitQuestion = async () => {
    if (hasAskedQuestion || askingQuestion || !meetingState?.current_agenda_id)
      return;
    setAskingQuestion(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenda_id: meetingState.current_agenda_id,
          memo: questionMemo,
        }),
      });
      if (res.ok) {
        setHasAskedQuestion(true);
        setQuestionSuccess(true);
        setShowMemoInput(false);
      } else alert("질문 신청 중 오류가 발생했습니다.");
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    }
    setAskingQuestion(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  // --- UI Conditional Logic ---
  if (loading) {
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center relative overflow-hidden">
        <Loader2 className="w-8 h-8 text-cyan-400/90 animate-spin relative z-10" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center p-6 relative overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HUD_SPRING}
          className="meeting-hud-surface rounded-[32px] p-10 max-w-md w-full text-center space-y-6 relative z-10"
        >
          <Shield className="w-12 h-12 text-accent-red mx-auto" />
          <h2 className="text-xl font-semibold tracking-tight text-accent-red">
            접근 차단
          </h2>
          <p className="text-sm text-slate-400">{authError}</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => router.push("/")}
            className="meeting-hud-energy meeting-hud-energy--cyan w-full px-6 py-3 rounded-2xl border-[0.5px] border-white/[0.12] text-sm font-medium text-slate-100 cursor-pointer"
          >
            돌아가기
          </motion.button>
        </motion.div>
      </div>
    );
  }

  const phaseLabel: Record<Phase, string> = {
    IDLE: "대기 중",
    INTRO: "안건 소개",
    QA: "질의응답",
    VOTING: "투표 진행",
    RESULT: "결과 확인",
    ENDED: "회의 종료",
  };

  const isPreMeeting = phase === "IDLE" && !meetingState?.current_agenda_id;
  const isAgendaIdle = phase === "IDLE" && !!meetingState?.current_agenda_id;
  const attendeePdfHidden = isAgendaIdle || phase === "RESULT";
  const showQuestionUI = !isPreMeeting && (phase === "INTRO" || phase === "QA");
  const showVotingFooter =
    phase === "VOTING" &&
    (voteSuccess || hasVoted || (timerSeconds !== null && timerSeconds > 0));

  const stationMeta = profile?.assigned_seat
    ? `[ STATION: ${profile.assigned_seat.replace(/-/g, "_").toUpperCase()} ]`
    : "[ STATION: — ]";

  return (
    <div className="h-screen w-screen overflow-hidden relative meeting-hud-dotgrid text-slate-100">
      <div className="meeting-hud-scanline" aria-hidden />

      {/* 1. PDF Container with Snap & Pivot Zoom */}
      <div
        ref={scrollRef}
        className={`fixed inset-0 z-[2] overflow-y-auto overflow-x-auto transition-all ${
          scale === 1 ? "snap-y snap-mandatory" : ""
        }`}
        style={{ WebkitOverflowScrolling: "touch" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {numPages > 0 && (
          <div
            className={`flex flex-col gap-6 pt-24 pb-[32vh] px-2 transition-opacity duration-300 ${
              attendeePdfHidden
                ? "absolute inset-0 opacity-0 pointer-events-none -z-10"
                : "opacity-100"
            }`}
            style={{ width: "fit-content", minWidth: "100%", margin: "0 auto" }}
          >
            {Array.from({ length: numPages }).map((_, i) => (
              <div
                key={i}
                className="snap-start snap-always"
                style={{ scrollMarginTop: "100px" }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[i] = el;
                  }}
                  className="select-none rounded-lg mx-auto shadow-2xl bg-white border border-white/10"
                />
              </div>
            ))}
          </div>
        )}

        {/* PDF Loading / Error Overlays */}
        {pdfLoading && (
          <div className="flex items-center justify-center min-h-full">
            <div className="meeting-hud-surface rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-cyan-400/90 animate-spin" />
              <p className="text-slate-400 text-sm font-sans">
                안건 문서를 불러오는 중...
              </p>
            </div>
          </div>
        )}

        {pdfError && (
          <div className="flex items-center justify-center min-h-full">
            <div className="meeting-hud-surface rounded-[28px] p-8 max-w-sm text-center space-y-3">
              <AlertTriangle className="w-12 h-12 text-amber-400/90 mx-auto" />
              <p className="font-medium text-slate-100">
                안건 문서를 불러올 수 없습니다
              </p>
            </div>
          </div>
        )}

        {!pdfLoading && !pdfError && numPages === 0 && (
          <div className="flex items-center justify-center min-h-full">
            <div className="text-center space-y-3">
              <FileText className="w-16 h-16 text-slate-600 mx-auto" />
              <p className="text-slate-500 text-sm">안건을 기다리는 중...</p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Top Status HUD */}
      <div className="fixed top-4 left-3 right-3 z-30 flex justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HUD_SPRING}
          className="pointer-events-auto w-full max-w-xl rounded-full meeting-hud-surface px-4 py-2.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg border-[0.5px] border-white/[0.12] bg-blue-500/10 flex items-center justify-center">
              <Vote className="w-4 h-4 text-cyan-300/90" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-500 leading-tight">
                {stationMeta}
              </p>
              <p className="text-[11px] font-semibold text-slate-200 truncate font-sans tracking-tight">
                대위원회 · {profile?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <motion.span
              animate={{ opacity: [1, 0.72, 1] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className={`text-[9px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border-[0.5px] ${phase === "VOTING" ? "border-emerald-500/35 text-emerald-400 bg-emerald-500/10" : "border-white/10 text-slate-400 bg-white/5"}`}
            >
              {phaseLabel[phase]}
            </motion.span>
            {timerSeconds !== null && phase === "VOTING" && (
              <span
                className={`font-mono text-lg font-bold tabular-nums tracking-tight flex items-center gap-1.5 min-w-[4.5rem] justify-end ${timerSeconds <= 10 ? "text-red-400" : "text-emerald-400"}`}
              >
                <Timer className="w-4 h-4 shrink-0 opacity-80" />
                {Math.floor(timerSeconds / 60)}:
                {(timerSeconds % 60).toString().padStart(2, "0")}
              </span>
            )}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleLogout}
              className="p-2 rounded-full text-slate-500 hover:text-slate-200 cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* 3. Right Zoom Controls */}
      {numPages > 0 && !attendeePdfHidden && (
        <motion.div
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={HUD_SPRING}
          className="fixed top-[5.25rem] right-3 z-30 flex flex-col gap-2"
        >
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={zoomIn}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 cursor-pointer"
          >
            <ZoomIn className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={zoomOut}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 cursor-pointer"
          >
            <ZoomOut className="w-4 h-4" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={resetZoom}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 cursor-pointer"
          >
            <Maximize className="w-4 h-4" />
          </motion.button>
        </motion.div>
      )}

      {/* 4. Bottom Interaction Dock */}
      {(isPreMeeting ||
        showQuestionUI ||
        showVotingFooter ||
        phase === "RESULT") && (
        <>
          <div className="meeting-hud-dock-gradient" aria-hidden />
          <div className="meeting-hud-dock">
            <motion.div
              className="max-w-lg mx-auto w-full"
              initial={{ x: 0 }}
              animate={dockShake}
            >
              <AnimatePresence mode="wait">
                {/* IDLE State */}
                {isPreMeeting && (
                  <motion.div
                    key="pre-meeting"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={DOCK_SPRING}
                    className="text-center space-y-4"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      [ STATUS: AWAIT_INITIALIZATION ]
                    </p>
                    <div className="w-14 h-14 rounded-2xl border-[0.5px] border-cyan-500/30 bg-blue-500/10 flex items-center justify-center mx-auto">
                      <Vote className="w-7 h-7 text-cyan-300/90" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-100 font-sans tracking-tight">
                      회의 시작 대기 중
                    </h3>
                  </motion.div>
                )}

                {/* Question UI (RESTORED & FIXED) */}
                {showQuestionUI && (
                  <motion.div
                    key="qa-action"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={DOCK_SPRING}
                  >
                    {questionSuccess || hasAskedQuestion ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-2xl border-[0.5px] border-emerald-500/25 bg-black/20 px-4 py-4 text-center space-y-2"
                      >
                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400/90">
                          [ STATUS: QUEUE_ACTIVE ]
                        </p>
                        <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="text-sm font-black text-emerald-400">
                          질문 신청 완료
                        </p>
                      </motion.div>
                    ) : showMemoInput ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-500/90 mb-1">
                              [ INPUT: QUESTION_MEMO ]
                            </p>
                            <p className="text-sm font-semibold text-amber-400/95 flex items-center gap-2 font-sans">
                              <MessageSquare className="w-4 h-4" />
                              질문 내용
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowMemoInput(false)}
                            className="text-slate-500 text-xs hover:text-slate-300 cursor-pointer font-mono uppercase tracking-wide"
                          >
                            접기
                          </button>
                        </div>
                        <textarea
                          value={questionMemo}
                          onChange={(e) => setQuestionMemo(e.target.value)}
                          placeholder="질문하고 싶은 내용을 적어 주세요 (선택)"
                          rows={3}
                          className="w-full px-3 py-2.5 rounded-2xl bg-black/30 border-[0.5px] border-white/10 text-slate-100 text-sm focus:border-amber-500/35 focus:outline-none resize-none"
                        />
                        <motion.button
                          whileTap={{ scale: 0.96 }}
                          onClick={submitQuestion}
                          disabled={askingQuestion}
                          className="w-full py-3 rounded-2xl border-[0.5px] border-amber-500/35 bg-amber-500/10 flex items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-amber-500/20"
                        >
                          <span className="text-sm font-black text-amber-500 tracking-tight">
                            {askingQuestion ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "질문 신청하기"
                            )}
                          </span>
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setShowMemoInput(true)}
                        className="group w-full flex items-center justify-center gap-3 rounded-full border border-amber-500/40 bg-amber-500/5 px-5 py-3 cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4 text-amber-700" />
                        <span className="text-sm font-black text-amber-800 font-sans tracking-tight">
                          질문하기
                        </span>
                        <ChevronRight className="w-4 h-4 text-amber-700" />
                      </motion.button>
                    )}
                  </motion.div>
                )}

                {/* Voting UI */}
                {showVotingFooter && (
                  <motion.div
                    key="vote-action"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={DOCK_SPRING}
                  >
                    {voteSuccess || hasVoted ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`rounded-2xl border-[0.5px] px-4 py-5 text-center space-y-3 ${voteSuccess === "CON" ? "border-red-500/35 bg-red-500/10" : "border-emerald-500/35 bg-emerald-500/10"}`}
                      >
                        <Check
                          className={`w-11 h-11 mx-auto ${voteSuccess === "CON" ? "text-red-400" : "text-emerald-400"}`}
                        />
                        <p
                          className={`text-sm font-black ${voteSuccess === "CON" ? "text-red-400" : "text-emerald-400"}`}
                        >
                          투표 완료
                        </p>
                      </motion.div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-center text-slate-500">
                          [ MODE: BALLOT_SYSTEM_V2 ]
                        </p>
                        <div className="flex gap-3">
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => submitVote("PRO")}
                            disabled={voting}
                            className="flex-1 py-3.5 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 text-emerald-500 font-black flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <ThumbsUp className="w-4 h-4" /> 찬성
                          </motion.button>
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setShowConReasonSheet(true)}
                            disabled={voting}
                            className="flex-1 py-3.5 rounded-2xl border border-red-500/40 bg-red-500/5 text-red-500 font-black flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <ThumbsDown className="w-4 h-4" /> 반대
                          </motion.button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Result Hold UI */}
                {phase === "RESULT" && (
                  <motion.div
                    key="result-info"
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={DOCK_SPRING}
                    className="rounded-2xl border border-violet-500/25 bg-violet-500/5 px-4 py-5 text-center"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-violet-400/80">
                      [ PHASE: INTER_AGENDA_HOLD ]
                    </p>
                    <p className="text-base font-black text-slate-100 font-sans">
                      다음 안건 대기 중
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </>
      )}

      {/* 5. Con Reason Sheet Modal */}
      <AnimatePresence>
        {showConReasonSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="meeting-hud-sheet-backdrop"
              onClick={() => setShowConReasonSheet(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={DOCK_SPRING}
              className="meeting-hud-sheet-panel"
            >
              <div className="shrink-0 space-y-1 pb-3 border-b border-white/[0.08]">
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-400/85">
                  [ INPUT: CON_RATIONALE ]
                </p>
                <p className="text-sm font-black text-slate-100 font-sans">
                  반대 사유 <span className="text-red-400">(필수)</span>
                </p>
              </div>
              <textarea
                value={conReason}
                onChange={(e) => setConReason(e.target.value)}
                placeholder="반대하는 이유를 입력해 주세요."
                className="mt-3 flex-1 w-full min-h-[120px] p-3 rounded-2xl bg-black/35 border border-white/10 text-slate-100 focus:border-red-500/35 focus:outline-none resize-none"
              />
              <div className="flex gap-3 mt-4 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowConReasonSheet(false)}
                  className="flex-1 py-3 rounded-2xl border border-white/10 text-slate-400 font-black cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => submitVote("CON", conReason)}
                  disabled={voting || !conReason.trim()}
                  className="flex-1 py-3 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-400 font-black cursor-pointer transition-colors hover:bg-red-500/30"
                >
                  반대 투표하기
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MeetingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center relative overflow-hidden">
          <Loader2 className="w-8 h-8 text-cyan-400/90 animate-spin" />
        </div>
      }
    >
      <MeetingContent />
    </Suspense>
  );
}
