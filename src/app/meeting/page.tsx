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
} from "lucide-react";
import { usePresence } from "@/components/SeatMap";

/** Precision HUD — animation only (visual spec). */
const HUD_SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };
const DOCK_SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };
const DOCK_TAP = { type: "spring" as const, stiffness: 500, damping: 35 };

function MeetingContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const seatParam = searchParams.get("seat");

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dockShake = useAnimation();
  const prevQuestionSuccess = useRef(false);
  const prevVoteSuccess = useRef<"PRO" | "CON" | null>(null);
  const phase: Phase = meetingState?.phase ?? "IDLE";

  useEffect(() => {
    if (phase === "ENDED") {
      router.replace("/meeting/closed");
    }
  }, [phase, router]);

  usePresence("saerom-presence", profile?.id);

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
  }, [phase, meetingState?.timer_end_at, checkVoteStatus]);

  useEffect(() => {
    if (phase === "IDLE" || phase === "QA" || phase === "INTRO") {
      checkQuestionStatus();
      setQuestionSuccess(false);
      setShowMemoInput(false);
      setQuestionMemo("");
    }
  }, [phase, checkQuestionStatus]);

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
        if (!pdfjsLib) throw new Error("PDF Worker Load Failed");

        const res = await fetch(agenda!.pdf_url!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        console.error("Meeting PDF load error:", err);
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

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        pinchRef.current = { dist: Math.hypot(dx, dy), scale };
      }
    },
    [scale],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchRef.current.dist;
      const next = Math.min(Math.max(pinchRef.current.scale * ratio, 1), 5);
      setScale(next);
    }
  }, []);

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
  const resetZoom = () => setScale(1);

  const submitVote = async (choice: "PRO" | "CON", conReasonText?: string) => {
    if (hasVoted || voting || !meetingState?.current_agenda_id) return;
    if (choice === "CON") {
      const r = (conReasonText ?? "").trim();
      if (!r) {
        alert("반대 사유를 입력해 주세요.");
        return;
      }
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
      const data = await res.json();
      if (res.ok) {
        setHasVoted(true);
        setVoteSuccess(choice);
        setConReason("");
      } else alert(data.error || "투표 중 오류가 발생했습니다.");
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
      const data = await res.json();
      if (res.ok) {
        setHasAskedQuestion(true);
        setQuestionSuccess(true);
        setShowMemoInput(false);
      } else alert(data.error || "질문 신청 중 오류가 발생했습니다.");
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    }
    setAskingQuestion(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center relative overflow-hidden">
        <div className="meeting-hud-scanline" aria-hidden />
        <Loader2 className="w-8 h-8 text-cyan-400/90 animate-spin relative z-10" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center p-6 relative overflow-hidden">
        <div className="meeting-hud-scanline" aria-hidden />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HUD_SPRING}
          className="meeting-hud-surface rounded-[32px] p-10 max-w-md w-full text-center space-y-6 relative z-10"
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
            [ SECTOR: ACCESS_DENIED ]
          </p>
          <Shield className="w-12 h-12 text-accent-red mx-auto" />
          <h2 className="text-xl font-semibold tracking-tight text-accent-red">
            접근 차단
          </h2>
          <p className="text-sm text-slate-400 font-sans">{authError}</p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={HUD_SPRING}
            onClick={() => router.push("/")}
            className="meeting-hud-energy meeting-hud-energy--cyan w-full px-6 py-3 rounded-2xl border-[0.5px] border-white/[0.12] text-sm font-medium text-slate-100 cursor-pointer font-sans"
          >
            <span className="relative z-[1]">돌아가기</span>
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

  if (phase === "ENDED") {
    return (
      <div className="h-screen w-screen meeting-hud-dotgrid flex items-center justify-center relative overflow-hidden">
        <div className="meeting-hud-scanline" aria-hidden />
        <div className="flex flex-col items-center gap-3 text-slate-400 text-sm relative z-10 font-sans">
          <Loader2 className="w-8 h-8 text-cyan-400/90 animate-spin" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            [ ROUTE: CLOSING_SEQUENCE ]
          </p>
          <p>감사 인사 화면으로 이동 중...</p>
        </div>
      </div>
    );
  }

  const isPreMeeting = phase === "IDLE" && !meetingState?.current_agenda_id;
  const isAgendaIdle = phase === "IDLE" && !!meetingState?.current_agenda_id;
  const hidePdfWhileLoadingIdle =
    isAgendaIdle && (pdfLoading || (numPages === 0 && !pdfError));
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
      <div
        ref={scrollRef}
        className="fixed inset-0 z-[2] overflow-y-auto overflow-x-auto"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {numPages > 0 && (
          <div
            className={`flex flex-col gap-3 pt-24 pb-[min(32vh,280px)] px-2 transition-opacity duration-300 ${
              attendeePdfHidden
                ? "absolute inset-0 opacity-0 pointer-events-none overflow-hidden -z-10"
                : ""
            }`}
            style={{ minWidth: "fit-content" }}
            aria-hidden={attendeePdfHidden}
          >
            {Array.from({ length: numPages }).map((_, i) => (
              <canvas
                key={i}
                ref={(el) => {
                  canvasRefs.current[i] = el;
                }}
                className="select-none rounded-sm mx-auto border-[0.5px] border-white/[0.1] meeting-hud-surface--flat bg-white"
              />
            ))}
          </div>
        )}
        {pdfLoading && (
          <div
            className={`flex items-center justify-center min-h-full ${
              attendeePdfHidden ? "absolute inset-0 z-[3]" : ""
            }`}
          >
            <div className="meeting-hud-surface rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-cyan-400/90 animate-spin" />
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                [ OP: DOC_LOAD ]
              </p>
              <p className="text-slate-400 text-sm font-sans text-center">
                {hidePdfWhileLoadingIdle
                  ? "안건 문서를 미리 불러오는 중..."
                  : "안건 문서를 불러오는 중..."}
              </p>
            </div>
          </div>
        )}
        {pdfError && (
          <div className="flex items-center justify-center min-h-full">
            <div className="meeting-hud-surface rounded-[28px] p-8 max-w-sm text-center space-y-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                [ ERR: PDF_FETCH ]
              </p>
              <AlertTriangle className="w-12 h-12 text-amber-400/90 mx-auto" />
              <p className="font-medium text-slate-100 font-sans">
                안건 문서를 불러올 수 없습니다
              </p>
              <p className="text-slate-500 text-sm font-sans">
                네트워크 상태를 확인하고 잠시 후 다시 시도해주세요
              </p>
            </div>
          </div>
        )}
        {!pdfLoading && !pdfError && numPages === 0 && (
          <div className="flex items-center justify-center min-h-full">
            <div className="text-center space-y-3 px-6">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                [ OP: AWAIT_AGENDA ]
              </p>
              <FileText className="w-16 h-16 text-slate-600 mx-auto" />
              <p className="text-slate-500 text-sm font-sans">
                {agenda ? "PDF가 등록되지 않았습니다" : "안건을 기다리는 중..."}
              </p>
            </div>
          </div>
        )}
        {isAgendaIdle && !pdfLoading && (
          <div className="absolute inset-0 z-[4] flex items-center justify-center pointer-events-none">
            <div className="meeting-hud-surface rounded-[28px] px-8 py-6 text-center space-y-2 max-w-sm">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-500/80">
                [ PHASE: IDLE_SYNC ]
              </p>
              <p className="text-base font-semibold text-slate-100 font-sans">
                안건을 기다리는중...
              </p>
              {pdfError && (
                <p className="text-slate-500 text-xs font-sans">
                  문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="fixed top-4 left-3 right-3 z-30 flex justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...HUD_SPRING, delay: 0 }}
          className="pointer-events-auto w-full max-w-xl rounded-full meeting-hud-surface px-4 py-2.5 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg border-[0.5px] border-white/[0.12] bg-[rgba(59,130,246,0.1)] flex items-center justify-center">
              <Vote className="w-4 h-4 text-cyan-300/90" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-500 leading-tight">
                {stationMeta}
              </p>
              <p className="text-[11px] font-semibold text-slate-200 truncate font-sans tracking-tight">
                SAEROM · {profile?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <motion.span
              animate={{ opacity: [1, 0.72, 1] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className={`text-[9px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border-[0.5px] ${
                phase === "VOTING"
                  ? "border-emerald-500/35 text-emerald-400 bg-emerald-500/[0.08]"
                  : phase === "QA"
                    ? "border-amber-500/35 text-amber-400 bg-amber-500/[0.08]"
                    : phase === "RESULT"
                      ? "border-violet-500/35 text-violet-300 bg-violet-500/[0.08]"
                      : "border-white/[0.1] text-slate-400 bg-white/[0.04]"
              }`}
            >
              {phaseLabel[phase]}
            </motion.span>
            {timerSeconds !== null && phase === "VOTING" && (
              <span
                className={`font-mono text-lg font-bold tabular-nums tracking-tight flex items-center gap-1.5 min-w-[4.5rem] justify-end ${
                  timerSeconds <= 10 ? "text-red-400" : "text-emerald-400"
                }`}
              >
                <Timer className="w-4 h-4 shrink-0 opacity-80" />
                {Math.floor(timerSeconds / 60)}:
                {(timerSeconds % 60).toString().padStart(2, "0")}
              </span>
            )}
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={HUD_SPRING}
              onClick={handleLogout}
              className="p-2 rounded-full border-[0.5px] border-transparent hover:border-white/[0.1] hover:bg-white/[0.04] text-slate-500 hover:text-slate-200 cursor-pointer"
              aria-label="로그아웃"
            >
              <span className="relative z-[1] inline-flex">
                <LogOut className="w-4 h-4" />
              </span>
            </motion.button>
          </div>
        </motion.div>
      </div>

      {numPages > 0 && !attendeePdfHidden && (
        <motion.div
          initial={{ opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...HUD_SPRING, delay: 0.1 }}
          className="fixed top-[5.25rem] right-3 z-30 flex flex-col gap-2"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={HUD_SPRING}
            onClick={zoomIn}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 cursor-pointer meeting-hud-energy meeting-hud-energy--neutral"
          >
            <span className="relative z-[1]">
              <ZoomIn className="w-4 h-4" />
            </span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={HUD_SPRING}
            onClick={zoomOut}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 cursor-pointer meeting-hud-energy meeting-hud-energy--neutral"
          >
            <span className="relative z-[1]">
              <ZoomOut className="w-4 h-4" />
            </span>
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            transition={HUD_SPRING}
            onClick={resetZoom}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-300 cursor-pointer meeting-hud-energy meeting-hud-energy--neutral"
          >
            <span className="relative z-[1]">
              <Maximize className="w-4 h-4" />
            </span>
          </motion.button>
        </motion.div>
      )}

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
            {isPreMeeting && (
              <motion.div
                key="pre-meeting"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ ...DOCK_SPRING, delay: 0.12 }}
                className="text-center space-y-4"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                  [ STATUS: AWAIT_INITIALIZATION ]
                </p>
                <motion.div
                  animate={{ opacity: [0.85, 1, 0.85] }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="w-14 h-14 rounded-2xl border-[0.5px] border-cyan-500/30 bg-[rgba(59,130,246,0.1)] flex items-center justify-center mx-auto"
                >
                  <Vote className="w-7 h-7 text-cyan-300/90" />
                </motion.div>
                <h3 className="text-base font-semibold text-slate-100 font-sans tracking-tight">
                  회의 시작 대기 중
                </h3>
                <p className="text-xs text-slate-500 font-sans leading-relaxed px-1">
                  진행자가 회의를 시작하면 자동으로 안내됩니다
                </p>
              </motion.div>
            )}

            {showQuestionUI && (
              <motion.div
                key="qa-action"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ ...DOCK_SPRING, delay: 0.12 }}
              >
                {questionSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={DOCK_SPRING}
                    className="rounded-2xl border-[0.5px] border-emerald-500/25 bg-black/20 px-4 py-4 text-center space-y-2"
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400/90">
                      [ TX: ENCRYPTED_AND_LOCKED ]
                    </p>
                    <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-sm font-black text-emerald-400 font-sans">
                      질문이 신청되었습니다
                    </p>
                  </motion.div>
                ) : hasAskedQuestion ? (
                  <div className="rounded-2xl border-[0.5px] border-white/[0.1] bg-black/15 px-4 py-4 text-center space-y-2">
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      [ STATUS: QUEUE_ACTIVE ]
                    </p>
                    <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-sm font-black text-slate-300 font-sans">
                      질문 신청 완료
                    </p>
                  </div>
                ) : showMemoInput ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-500/90 mb-1">
                          [ INPUT: QUESTION_MEMO ]
                        </p>
                        <p className="text-sm font-semibold text-amber-400/95 flex items-center gap-2 font-sans">
                          <MessageSquare className="w-4 h-4 shrink-0" />
                          질문 내용
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                          *필수 아님 — 비워도 질문 신청이 가능합니다
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowMemoInput(false)}
                        className="text-slate-500 text-xs hover:text-slate-300 cursor-pointer shrink-0 font-mono uppercase tracking-wide"
                      >
                        접기
                      </button>
                    </div>
                    <textarea
                      value={questionMemo}
                      onChange={(e) => setQuestionMemo(e.target.value)}
                      placeholder="질문하고 싶은 내용을 적어 주세요 (선택)"
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-2xl bg-black/30 border-[0.5px] border-white/[0.1] text-slate-100 text-sm focus:border-amber-500/35 focus:outline-none resize-none font-sans"
                    />
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      transition={DOCK_TAP}
                      onClick={submitQuestion}
                      disabled={askingQuestion}
                      className="group meeting-hud-energy meeting-hud-energy--amber meeting-hud-energy-tactile relative w-full min-h-12 py-3 rounded-2xl border-[0.5px] border-amber-500/35 bg-amber-500/[0.06] flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <span className="relative z-[1] text-sm font-black text-amber-700 group-hover:text-slate-950 font-sans tracking-tight">
                        질문 신청하기
                      </span>
                    </motion.button>
                  </div>
                ) : (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    transition={DOCK_TAP}
                    onClick={() => setShowMemoInput(true)}
                    disabled={!meetingState?.current_agenda_id}
                    className="group meeting-hud-energy meeting-hud-energy--amber meeting-hud-energy-tactile relative w-full max-w-md mx-auto flex min-h-12 flex-row items-center justify-center gap-3 rounded-full border-[0.5px] border-amber-500/40 bg-amber-500/[0.05] px-5 py-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="relative z-[1] text-sm font-black text-amber-800 group-hover:text-slate-950 font-sans">
                      질문하기
                    </span>
                  </motion.button>
                )}
              </motion.div>
            )}

            {showVotingFooter && (
              <motion.div
                key="vote-action"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ ...DOCK_SPRING, delay: 0.12 }}
              >
                {voteSuccess ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={DOCK_SPRING}
                    className={`rounded-2xl border-[0.5px] px-4 py-5 text-center space-y-3 ${
                      voteSuccess === "PRO"
                        ? "border-emerald-500/35 bg-emerald-500/[0.06]"
                        : "border-red-500/35 bg-red-500/[0.06]"
                    }`}
                  >
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-400">
                      [ TX: ENCRYPTED_AND_LOCKED ]
                    </p>
                    <Check
                      className={`w-11 h-11 mx-auto ${voteSuccess === "PRO" ? "text-emerald-400" : "text-red-400"}`}
                    />
                    <p
                      className={`text-sm font-black font-sans ${voteSuccess === "PRO" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {voteSuccess === "PRO" ? "찬성" : "반대"} 완료
                    </p>
                  </motion.div>
                ) : hasVoted ? (
                  <div className="rounded-2xl border-[0.5px] border-white/[0.1] bg-black/15 px-4 py-4 text-center space-y-2">
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-slate-500">
                      [ STATUS: VOTE_LOCKED ]
                    </p>
                    <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-sm font-black text-slate-400 font-sans">
                      이미 투표하셨습니다
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-center text-slate-500">
                      [ MODE: BALLOT_SYSTEM_V2 ]
                    </p>
                    <div className="flex gap-3">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        transition={DOCK_TAP}
                        onClick={() => {
                          setShowConReasonSheet(false);
                          setConReason("");
                          submitVote("PRO");
                        }}
                        disabled={voting}
                        className="group meeting-hud-energy meeting-hud-energy--pro meeting-hud-energy-tactile flex-1 min-h-12 py-3.5 rounded-2xl border-[0.5px] border-emerald-500/40 bg-emerald-500/[0.04] flex flex-row items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <span className="relative z-[1] flex items-center gap-2">
                          <ThumbsUp className="w-5 h-5 text-emerald-700 group-hover:text-slate-950" />
                          <span className="text-sm font-black text-emerald-800 group-hover:text-slate-950 font-sans">
                            찬성
                          </span>
                        </span>
                      </motion.button>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        transition={DOCK_TAP}
                        onClick={() => setShowConReasonSheet(true)}
                        disabled={voting}
                        className={`group meeting-hud-energy meeting-hud-energy--con meeting-hud-energy-tactile flex-1 min-h-12 py-3.5 rounded-2xl border-[0.5px] flex flex-row items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                          showConReasonSheet
                            ? "border-red-400/60 bg-red-500/[0.1]"
                            : "border-red-500/40 bg-red-500/[0.04]"
                        }`}
                      >
                        <span className="relative z-[1] flex items-center gap-2">
                          <ThumbsDown className="w-5 h-5 text-red-700 group-hover:text-slate-950" />
                          <span className="text-sm font-black text-red-800 group-hover:text-slate-950 font-sans">
                            반대
                          </span>
                        </span>
                      </motion.button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {phase === "RESULT" && (
              <motion.div
                key="result-info"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ ...DOCK_SPRING, delay: 0.12 }}
                className="rounded-2xl border-[0.5px] border-violet-500/25 bg-violet-500/[0.05] px-4 py-5 text-center space-y-2"
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-violet-400/80">
                  [ PHASE: INTER_AGENDA_HOLD ]
                </p>
                <p className="text-base font-black text-slate-100 font-sans">
                  다음 안건 대기중
                </p>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  진행자 안내에 따라 다음 단계가 시작됩니다
                </p>
              </motion.div>
            )}
              </AnimatePresence>
            </motion.div>
          </div>
        </>
      )}

      <AnimatePresence>
        {showConReasonSheet && (
          <>
            <motion.div
              key="con-backdrop"
              role="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="meeting-hud-sheet-backdrop"
              onClick={() => {
                setShowConReasonSheet(false);
                setConReason("");
              }}
            />
            <motion.div
              key="con-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="con-sheet-title"
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
                <p
                  id="con-sheet-title"
                  className="text-sm font-black text-slate-100 font-sans"
                >
                  반대 사유 <span className="text-red-400">(필수)</span>
                </p>
              </div>
              <textarea
                value={conReason}
                onChange={(e) => setConReason(e.target.value)}
                placeholder="반대하는 이유를 입력해 주세요."
                className="mt-3 flex-1 min-h-[120px] w-full px-3 py-2.5 rounded-2xl bg-black/35 border-[0.5px] border-white/[0.1] text-slate-100 text-sm focus:border-red-500/35 focus:outline-none resize-none font-sans"
              />
              <div className="flex gap-3 mt-4 shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={DOCK_TAP}
                  onClick={() => {
                    setShowConReasonSheet(false);
                    setConReason("");
                  }}
                  className="group meeting-hud-energy meeting-hud-energy--neutral meeting-hud-energy-tactile flex-1 min-h-12 rounded-2xl border-[0.5px] border-white/[0.12] text-slate-400 text-sm font-black cursor-pointer"
                >
                  <span className="relative z-[1] text-slate-300 group-hover:text-slate-950 font-sans">
                    취소
                  </span>
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={DOCK_TAP}
                  onClick={() => submitVote("CON", conReason)}
                  disabled={voting || conReason.trim().length === 0}
                  className="group meeting-hud-energy meeting-hud-energy--con meeting-hud-energy-tactile flex-1 min-h-12 rounded-2xl border-[0.5px] border-red-500/40 text-sm font-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span className="relative z-[1] flex justify-center text-red-900 group-hover:text-slate-950 font-sans">
                    {voting ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto text-red-200" />
                    ) : (
                      "반대 투표하기"
                    )}
                  </span>
                </motion.button>
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
          <div className="meeting-hud-scanline" aria-hidden />
          <Loader2 className="w-8 h-8 text-cyan-400/90 animate-spin relative z-10" />
        </div>
      }
    >
      <MeetingContent />
    </Suspense>
  );
}
