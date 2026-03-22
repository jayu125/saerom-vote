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
  Clock,
} from "lucide-react";
import { usePresence } from "@/components/SeatMap";

const HUD_SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };
const DOCK_SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };

function MeetingContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const router = useRouter();
  const seatParam = searchParams.get("seat");

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isPending, setIsPending] = useState(false);
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
  const zoomPosRef = useRef({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
    scaleAtStart: 1,
  });
  const dockShake = useAnimation();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phase: Phase = meetingState?.phase ?? "IDLE";

  // 온라인 상태 Presence 감시
  usePresence("saerom-presence", profile?.id);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const currentPath = window.location.pathname + window.location.search;
        router.push(`/?next=${encodeURIComponent(currentPath)}`);
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

      // 승인 대기 로직
      if (!profileData) {
        const { data: reqData } = await supabase
          .from("registration_requests")
          .select("status")
          .eq("email", user.email!)
          .maybeSingle();
        if (reqData) {
          setIsPending(true);
          setLoading(false);
          return;
        }
        setAuthError("등록되지 않은 사용자입니다.");
        setLoading(false);
        return;
      }

      const p = profileData as Profile;

      if (seatParam) {
        if (p.assigned_seat && p.assigned_seat !== seatParam) {
          setAuthError(`이미 ${p.assigned_seat} 번 좌석에 등록되어 있습니다.`);
          setLoading(false);
          return;
        }
        if (!p.assigned_seat) {
          const { data: occupant } = await supabase
            .from("profiles")
            .select("name")
            .eq("assigned_seat", seatParam)
            .maybeSingle();
          if (occupant) {
            setAuthError(
              `해당 좌석은 이미 ${occupant.name} 님이 사용 중입니다.`,
            );
            setLoading(false);
            return;
          }
          await supabase
            .from("profiles")
            .update({ assigned_seat: seatParam })
            .eq("id", user.id);
          p.assigned_seat = seatParam;
        }
      } else if (!p.assigned_seat) {
        setAuthError("좌석 QR 코드를 통해 접속해주세요.");
        setLoading(false);
        return;
      }

      setProfile(p);
      setIsPending(false);
      const { data: msData } = await supabase
        .from("meeting_state")
        .select("*")
        .maybeSingle();
      if (msData) setMeetingState(msData as MeetingState);
      setLoading(false);
    }
    init();
  }, [supabase, seatParam, router]);

  // 실시간 회의 상태 동기화 구독
  useEffect(() => {
    const channel = supabase
      .channel("attendee-realtime-sync")
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
          if (profile && meetingState?.current_agenda_id)
            supabase
              .from("questions")
              .select("id")
              .eq("agenda_id", meetingState.current_agenda_id)
              .eq("user_id", profile.id)
              .in("status", ["waiting", "speaking"])
              .maybeSingle()
              .then(({ data }) => setHasAskedQuestion(!!data));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profile, meetingState?.current_agenda_id]);

  useEffect(() => {
    if (phase === "ENDED") router.replace("/meeting/closed");
    if (meetingState?.current_agenda_id) {
      supabase
        .from("agendas")
        .select("*")
        .eq("id", meetingState.current_agenda_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setAgenda(data as Agenda);
        });
      if (profile) {
        supabase
          .from("votes")
          .select("id")
          .eq("agenda_id", meetingState.current_agenda_id)
          .eq("user_id", profile.id)
          .maybeSingle()
          .then(({ data }) => setHasVoted(!!data));
      }
    }
  }, [phase, meetingState?.current_agenda_id, profile, supabase, router]);

  // --- PDF & Interaction (Original logic preserved) ---
  useEffect(() => {
    if (!agenda?.pdf_url) {
      setNumPages(0);
      return;
    }
    let cancelled = false;
    async function load() {
      setPdfLoading(true);
      setPdfError(false);
      try {
        const pdfjsLib = await initPdfWorker();
        if (!pdfjsLib) throw new Error("Null");
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
      } catch {
        if (!cancelled) setPdfError(true);
      }
      if (!cancelled) setPdfLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [agenda?.pdf_url]);

  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;
    let cancelled = false;
    async function render() {
      const pdf = pdfDocRef.current;
      const container = scrollRef.current;
      if (!pdf || !container) return;
      await new Promise((r) => requestAnimationFrame(r));
      const containerWidth = container.clientWidth;
      const dims: { w: number; h: number }[] = [];
      for (let i = 0; i < numPages; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas || cancelled) continue;
        const page = await pdf.getPage(i + 1);
        const raw = page.getViewport({ scale: 1 });
        const fitScale = (containerWidth * 0.94) / raw.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    render();
    return () => {
      cancelled = true;
    };
  }, [numPages]);

  useEffect(() => {
    pageBaseDims.forEach((dim, i) => {
      if (canvasRefs.current[i]) {
        canvasRefs.current[i]!.style.width = `${dim.w * scale}px`;
        canvasRefs.current[i]!.style.height = `${dim.h * scale}px`;
      }
    });
  }, [scale, pageBaseDims]);

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

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && scrollRef.current) {
      const dist = Math.hypot(
        e.touches[1].clientX - e.touches[0].clientX,
        e.touches[1].clientY - e.touches[0].clientY,
      );
      const nextScale = Math.min(
        Math.max(pinchRef.current.scale * (dist / pinchRef.current.dist), 1),
        5,
      );
      const { x, y, scrollLeft, scrollTop, scaleAtStart } = zoomPosRef.current;
      const ratio = nextScale / scaleAtStart;
      scrollRef.current.scrollLeft = (scrollLeft + x) * ratio - x;
      scrollRef.current.scrollTop = (scrollTop + y) * ratio - y;
      setScale(nextScale);
    }
  }, []);

  const submitVote = async (choice: "PRO" | "CON", reason?: string) => {
    if (hasVoted || voting || !meetingState?.current_agenda_id) return;
    setVoting(true);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agenda_id: meetingState.current_agenda_id,
          choice,
          con_reason: reason,
        }),
      });
      if (res.ok) {
        setHasVoted(true);
        setVoteSuccess(choice);
      }
    } finally {
      setVoting(false);
      setShowConReasonSheet(false);
    }
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
      }
    } finally {
      setAskingQuestion(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );

  if (isPending) {
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="meeting-hud-surface rounded-[32px] p-10 max-w-md w-full text-center space-y-6"
        >
          <Clock className="w-12 h-12 text-amber-500 animate-pulse mx-auto" />
          <h2 className="text-xl font-bold text-amber-500">
            가입 승인 대기 중
          </h2>
          <p className="text-sm text-slate-400">
            관리자가 가입 요청을 확인 중이에요.
            <br />
            승인되면 자동으로 회의실에 입장합니다.
          </p>
        </motion.div>
      </div>
    );
  }

  if (authError)
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center p-6">
        <div className="meeting-hud-surface p-10 rounded-3xl space-y-6 text-center shadow-2xl border border-white/10">
          <Shield className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold">접근 차단</h2>
          <p className="text-sm opacity-50">{authError}</p>
          <button
            onClick={() => router.push("/")}
            className="w-full py-3 rounded-2xl bg-cyan-600 font-bold cursor-pointer"
          >
            돌아가기
          </button>
        </div>
      </div>
    );

  const attendeePdfHidden =
    (phase === "IDLE" && !!meetingState?.current_agenda_id) ||
    phase === "RESULT";
  const stationMeta = profile?.assigned_seat
    ? `[ STATION: ${profile.assigned_seat.replace(/-/g, "_").toUpperCase()} ]`
    : "[ STATION: — ]";

  return (
    <div className="h-screen w-screen overflow-hidden relative meeting-hud-dotgrid text-white font-sans">
      <div className="meeting-hud-scanline pointer-events-none" />

      <div
        ref={scrollRef}
        className={`fixed inset-0 z-[2] overflow-auto transition-all ${scale === 1 ? "snap-y snap-mandatory" : ""}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        {numPages > 0 && (
          <div
            className={`flex flex-col gap-6 pt-24 pb-[32vh] px-2 transition-opacity ${attendeePdfHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            style={{ width: "fit-content", minWidth: "100%", margin: "0 auto" }}
          >
            {Array.from({ length: numPages }).map((_, i) => (
              <div
                key={i}
                className="snap-start"
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
      </div>

      <div className="fixed top-4 left-3 right-3 z-30 flex justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={HUD_SPRING}
          className="pointer-events-auto w-full max-w-xl rounded-full meeting-hud-surface px-4 py-2.5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
              <Vote className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-left leading-tight">
              <p className="text-[8px] font-mono opacity-50">{stationMeta}</p>
              <p className="text-[11px] font-bold">
                대위원회 · {profile?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono px-2.5 py-1 rounded-full border border-white/10 uppercase bg-white/5">
              {phase}
            </span>
            <button
              onClick={() => {
                supabase.auth.signOut();
                router.push("/");
              }}
              className="p-2 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>

      {!attendeePdfHidden && (
        <div className="fixed top-[5.25rem] right-3 z-30 flex flex-col gap-2">
          <button
            onClick={() => setScale((s) => Math.min(s + 0.5, 5))}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer hover:text-cyan-400"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s - 0.5, 1))}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer hover:text-cyan-400"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setScale(1);
              scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="meeting-hud-surface w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer hover:text-cyan-400"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      )}

      {(phase !== "IDLE" || !!meetingState?.current_agenda_id) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-8 bg-gradient-to-t from-black/80 to-transparent">
          <motion.div animate={dockShake} className="max-w-lg mx-auto">
            <AnimatePresence mode="wait">
              {(phase === "INTRO" || phase === "QA") && (
                <motion.div
                  key="qa"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={DOCK_SPRING}
                >
                  {hasAskedQuestion || questionSuccess ? (
                    <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-center">
                      <Check className="w-6 h-6 mx-auto mb-1 text-cyan-400" />
                      <p className="text-sm font-bold text-cyan-400">
                        질문 신청 완료
                      </p>
                    </div>
                  ) : showMemoInput ? (
                    <div className="space-y-3 bg-black/60 backdrop-blur-2xl p-5 rounded-3xl border border-white/10 shadow-2xl">
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] font-bold text-cyan-400 font-mono">
                          [ QUESTION_MEMO_INPUT ]
                        </p>
                        <button
                          onClick={() => setShowMemoInput(false)}
                          className="text-[10px] opacity-50 cursor-pointer uppercase"
                        >
                          Collapse
                        </button>
                      </div>
                      <textarea
                        value={questionMemo}
                        onChange={(e) => setQuestionMemo(e.target.value)}
                        placeholder="질문을 입력하세요..."
                        className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500/50"
                      />
                      <button
                        onClick={submitQuestion}
                        className="w-full py-3 rounded-xl bg-cyan-600 font-bold cursor-pointer transition-colors hover:bg-cyan-500"
                      >
                        {askingQuestion ? "Processing..." : "Submit Question"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowMemoInput(true)}
                      className="w-full py-4 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 font-bold flex items-center justify-center gap-3 cursor-pointer hover:bg-white/10 shadow-xl"
                    >
                      <MessageSquare className="w-5 h-5 text-cyan-400" />{" "}
                      질문하기 <ChevronRight className="w-4 h-4 opacity-30" />
                    </button>
                  )}
                </motion.div>
              )}
              {phase === "VOTING" && (
                <motion.div
                  key="vote"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={DOCK_SPRING}
                >
                  {hasVoted || voteSuccess ? (
                    <div className="p-5 rounded-2xl bg-white/5 border border-white/10 text-center backdrop-blur-lg">
                      <Check className="w-10 h-10 mx-auto mb-1 text-cyan-400" />
                      <p className="text-sm font-bold opacity-50 uppercase tracking-widest font-mono">
                        Ballot Submitted
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <button
                        onClick={() => submitVote("PRO")}
                        className="flex-1 py-4 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 font-bold cursor-pointer hover:bg-cyan-500/30 transition-colors"
                      >
                        찬성
                      </button>
                      <button
                        onClick={() => setShowConReasonSheet(true)}
                        className="flex-1 py-4 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-400 font-bold cursor-pointer hover:bg-red-500/30 transition-colors"
                      >
                        반대
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {showConReasonSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConReasonSheet(false)}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={DOCK_SPRING}
              className="fixed bottom-0 left-0 right-0 z-50 p-8 bg-[#0F1116] rounded-t-[40px] border-t border-white/10 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">
                  반대 사유 입력{" "}
                  <span className="text-red-500 text-xs font-normal ml-2">
                    (필수)
                  </span>
                </h3>
              </div>
              <textarea
                value={conReason}
                onChange={(e) => setConReason(e.target.value)}
                placeholder="반대하시는 이유를 상세히 적어주세요."
                className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm mb-6 focus:outline-none focus:border-red-500/50"
              />
              <div className="flex gap-4">
                <button
                  onClick={() => setShowConReasonSheet(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 font-bold cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={() => submitVote("CON", conReason)}
                  disabled={!conReason.trim()}
                  className="flex-1 py-4 rounded-2xl bg-red-600 font-bold cursor-pointer transition-colors hover:bg-red-500 disabled:opacity-30"
                >
                  투표 완료
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
    <Suspense fallback={null}>
      <MeetingContent />
    </Suspense>
  );
}
