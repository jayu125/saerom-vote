"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Vote,
  MessageCircle,
  Timer,
  Mic,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePresence } from "@/components/SeatMap";
import SeatGrid from "@/components/SeatGrid";
import type {
  Phase,
  MeetingState,
  Agenda,
  Profile,
  Vote as VoteType,
  SeatVoteInfo,
  SeatLayout,
} from "@/lib/types";
import { DEFAULT_SEAT_LAYOUT } from "@/lib/types";
import { initPdfWorker } from "@/lib/pdf-utils";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSeat(seat: string): { row: number; col: number } {
  const parts = seat.split("-");
  if (parts.length === 2) {
    return {
      row: parseInt(parts[0], 10) || 0,
      col: parseInt(parts[1], 10) || 0,
    };
  }
  const match = seat.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    const rowStr = match[1].toUpperCase();
    let row = 0;
    for (let i = 0; i < rowStr.length; i++)
      row = row * 26 + (rowStr.charCodeAt(i) - 64);
    return { row, col: parseInt(match[2], 10) };
  }
  return { row: 0, col: 0 };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Floating Particles (IDLE background)
// ---------------------------------------------------------------------------

function Particles() {
  const [particles, setParticles] = useState<
    Array<{
      id: number;
      x: number;
      y: number;
      size: number;
      duration: number;
      delay: number;
      opacity: number;
      xDrift: number;
    }>
  >([]);

  useEffect(() => {
    setParticles(
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 1,
        duration: Math.random() * 20 + 15,
        delay: Math.random() * 10,
        opacity: Math.random() * 0.4 + 0.1,
        xDrift: Math.random() * 60 - 30,
      })),
    );
  }, []);

  if (particles.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `radial-gradient(circle, rgba(59,130,246,${Math.min(0.35, p.opacity * 0.65)}), transparent)`,
          }}
          animate={{
            y: [0, -120, 0],
            x: [0, p.xDrift, 0],
            opacity: [p.opacity, p.opacity * 2, p.opacity],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confetti Particles (RESULT – passed)
// ---------------------------------------------------------------------------

function Confetti() {
  const [pieces, setPieces] = useState<
    Array<{
      id: number;
      x: number;
      color: string;
      size: number;
      delay: number;
      rotation: number;
    }>
  >([]);

  useEffect(() => {
    setPieces(
      Array.from({ length: 60 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: [
          "#3B82F6",
          "#06B6D4",
          "#10B981",
          "#F59E0B",
          "#8B5CF6",
          "#EF4444",
        ][Math.floor(Math.random() * 6)],
        size: Math.random() * 8 + 4,
        delay: Math.random() * 1.5,
        rotation: Math.random() * 360,
      })),
    );
  }, []);

  if (pieces.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          className="absolute"
          style={{
            left: `${p.x}%`,
            top: -20,
            width: p.size,
            height: p.size * 1.4,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{
            y: "110vh",
            rotate: p.rotation + 720,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 3.5,
            delay: p.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timer Ring
// ---------------------------------------------------------------------------

function TimerRing({ seconds }: { seconds: number }) {
  const total = 120;
  const pct = Math.min(seconds / total, 1);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const urgent = seconds <= 10;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-2"
    >
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="6"
          />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={urgent ? "#dc2626" : "#2563eb"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-3xl font-bold font-mono ${urgent ? "text-red-600" : "text-slate-900"}`}
          >
            {formatTime(seconds)}
          </span>
        </div>
      </div>
      <span className="text-sm text-slate-600 flex items-center gap-1.5">
        <Timer className="w-4 h-4" /> 투표 남은 시간
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Counting Dots (timer expired, tallying votes)
// ---------------------------------------------------------------------------

function CountingDots() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-3"
    >
      <div className="flex items-end gap-2 h-12">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-3.5 h-3.5 rounded-full bg-violet-700"
            animate={{ y: [0, -16, 0] }}
            transition={{
              duration: 0.8,
              delay: i * 0.15,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <span className="text-sm text-violet-900 font-semibold">집계 중</span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Seat Cell (voting + result flip)
// ---------------------------------------------------------------------------

interface SeatCellProps {
  info: SeatVoteInfo;
  phase: Phase;
  flipDelay: number;
}

function SeatCell({ info, phase, flipDelay }: SeatCellProps) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (phase === "RESULT" && info.voted) {
      const timer = setTimeout(() => setFlipped(true), flipDelay);
      return () => clearTimeout(timer);
    }
    if (phase !== "RESULT") setFlipped(false);
  }, [phase, info.voted, flipDelay]);

  const baseClasses =
    "w-[54px] h-[54px] rounded-lg text-[0.6875rem] font-semibold flex items-center justify-center select-none";

  const frontBg =
    phase === "RESULT" || phase === "VOTING"
      ? info.voted
        ? "bg-blue-600 text-white border border-blue-700 shadow-md shadow-blue-600/20"
        : info.online
          ? "bg-sky-100 text-slate-900 border border-sky-300"
          : "bg-slate-200 text-slate-900 border border-slate-300"
      : info.online
        ? "bg-sky-100 text-slate-900 border border-sky-300"
        : "bg-slate-200 text-slate-900 border border-slate-300";

  const onlineGlow =
    info.online && !info.voted && phase !== "RESULT"
      ? {
          boxShadow:
            "0 2px 10px rgba(14,165,233,0.2), 0 0 0 1px rgba(14,165,233,0.12)",
        }
      : {};

  const backColor =
    info.choice === "PRO"
      ? "bg-emerald-600 text-white border border-emerald-700 shadow-md shadow-emerald-600/25"
      : "bg-red-600 text-white border border-red-700 shadow-md shadow-red-600/25";

  return (
    <motion.div
      className="seat-flip"
      initial={false}
      animate={phase === "VOTING" && info.voted ? { scale: [1, 1.25, 1] } : {}}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div
        className={`seat-flip-inner relative w-[54px] h-[54px] ${flipped ? "flipped" : ""}`}
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.7s cubic-bezier(.4,.2,.2,1)",
        }}
      >
        {/* Front */}
        <div
          className={`seat-flip-front absolute inset-0 ${baseClasses} ${frontBg} transition-colors duration-300`}
          style={{ backfaceVisibility: "hidden", ...onlineGlow }}
        >
          {info.seat}
        </div>
        {/* Back */}
        <div
          className={`seat-flip-back absolute inset-0 ${baseClasses} ${backColor}`}
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {info.choice === "PRO" ? "찬성" : "반대"}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Phase Components
// ---------------------------------------------------------------------------

function PreMeetingPhase({
  profiles,
  presenceSet,
  layout,
}: {
  profiles: Profile[];
  presenceSet: Set<string>;
  layout: SeatLayout;
}) {
  const onlineCount = profiles.filter((p) => presenceSet.has(p.id)).length;
  const totalCols = layout.sections.reduce((a, b) => a + b, 0);
  const totalSeats = layout.rows * totalCols;

  return (
    <motion.div
      key="pre-meeting"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-full gap-8 relative"
    >
      <Particles />

      <div className="text-center z-10">
        <motion.div
          animate={{
            boxShadow: [
              "0 0 32px rgba(59,130,246,0.18), 0 0 80px rgba(59,130,246,0.07)",
              "0 0 40px rgba(139,92,246,0.2), 0 0 100px rgba(139,92,246,0.09)",
              "0 0 32px rgba(6,182,212,0.2), 0 0 80px rgba(6,182,212,0.08)",
              "0 0 32px rgba(59,130,246,0.18), 0 0 80px rgba(59,130,246,0.07)",
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="w-20 h-20 rounded-2xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-cyan flex items-center justify-center mx-auto mb-4"
        >
          <Vote className="w-10 h-10 text-white" />
        </motion.div>
        <motion.h1
          className="text-5xl font-extrabold tracking-tight gradient-text"
          animate={{ opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 4, repeat: Infinity }}
        >
          대위원회
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-2 text-lg text-slate-600"
        >
          참석자 입장 대기 중 ·{" "}
          <span className="text-blue-700 font-semibold">{onlineCount}</span>/
          {totalSeats}석
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
        className="z-10"
      >
        <SeatGrid
          layout={layout}
          profiles={profiles}
          presenceSet={presenceSet}
          cellSize={54}
          appearance="light"
        />
      </motion.div>
    </motion.div>
  );
}

function IdlePhase({
  questions,
}: {
  questions: {
    id: string;
    memo: string;
    profile?: { name: string; assigned_seat: string } | null;
  }[];
}) {
  const waitingQs = questions.filter(
    (q) => (q as { status?: string }).status === "waiting",
  );

  return (
    <motion.div
      key="idle"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full relative"
    >
      {/* Main center content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 relative">
        <Particles />

        <motion.div
          animate={{
            boxShadow: [
              "0 0 32px rgba(59,130,246,0.18), 0 0 80px rgba(59,130,246,0.07)",
              "0 0 40px rgba(139,92,246,0.2), 0 0 100px rgba(139,92,246,0.09)",
              "0 0 32px rgba(6,182,212,0.2), 0 0 80px rgba(6,182,212,0.08)",
              "0 0 32px rgba(59,130,246,0.18), 0 0 80px rgba(59,130,246,0.07)",
            ],
          }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="w-28 h-28 rounded-3xl bg-gradient-to-br from-accent-blue via-accent-purple to-accent-cyan flex items-center justify-center"
        >
          <Vote className="w-14 h-14 text-white" />
        </motion.div>

        <div className="text-center z-10">
          <motion.h1
            className="text-7xl font-extrabold tracking-tight gradient-text"
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            안건 발의 준비 중
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-4 text-xl text-slate-600"
          >
            조금만 기다려주세요.
          </motion.p>
        </div>
      </div>

      {/* Question sidebar */}
      {waitingQs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-80 glass-strong border-l border-slate-300 flex flex-col z-10"
        >
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-amber-700" />
            <span className="text-sm font-semibold text-slate-900">
              질문 ({waitingQs.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {waitingQs.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {q.profile?.name ?? "알 수 없음"}
                </p>
                <p className="text-[0.625rem] text-slate-500">
                  좌석 {q.profile?.assigned_seat}
                </p>
                {q.memo && (
                  <p className="text-xs text-sky-800 mt-1 line-clamp-3">
                    {q.memo}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function IntroPhase({ agenda }: { agenda: Agenda | null }) {
  const [stage, setStage] = useState<"landing" | "content">("landing");
  const viewerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [numPages, setNumPages] = useState(0);
  const [pdfReady, setPdfReady] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [viewerMounted, setViewerMounted] = useState(false);

  const viewerRefCallback = useCallback((el: HTMLDivElement | null) => {
    viewerRef.current = el;
    if (el) setViewerMounted(true);
  }, []);

  useEffect(() => {
    if (!agenda?.pdf_url) return;
    let cancelled = false;

    async function loadPdf() {
      try {
        const pdfjsLib = await initPdfWorker();
        if (!pdfjsLib) throw new Error("PDF worker unavailable");
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
        setPdfReady(true);
      } catch (err) {
        console.error("Screen PDF load error:", err);
        if (!cancelled) setPdfError(true);
      }
    }
    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [agenda?.pdf_url]);

  useEffect(() => {
    if (!pdfDocRef.current || !pdfReady || !viewerMounted || numPages === 0)
      return;
    let cancelled = false;

    const timerId = setTimeout(async () => {
      const pdf = pdfDocRef.current;
      const viewer = viewerRef.current;
      if (!pdf || !viewer || cancelled) return;

      const containerWidth = viewer.clientWidth || window.innerWidth;
      if (containerWidth === 0) return;

      for (let i = 0; i < numPages; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas || cancelled) continue;

        const page = await pdf.getPage(i + 1);
        const raw = page.getViewport({ scale: 1 });
        const fitScale = (containerWidth * 0.88) / raw.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const viewport = page.getViewport({ scale: fitScale * dpr });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${raw.width * fitScale}px`;
        canvas.style.height = `${raw.height * fitScale}px`;

        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas } as any)
          .promise;
      }
    }, 150); // 충분한 렌더링 지연 시간 확보

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [pdfReady, viewerMounted, numPages]);

  useEffect(() => {
    const timer = setTimeout(() => setStage("content"), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, []);

  return (
    <motion.div
      key="intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full relative"
    >
      <AnimatePresence mode="wait">
        {stage === "landing" && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -60 }}
            className="flex flex-col items-center justify-center h-full gap-8"
          >
            <h1 className="text-6xl font-extrabold gradient-text text-center max-w-4xl leading-tight">
              {agenda?.title ?? "불러오는 중..."}
            </h1>
            {agenda?.description && (
              <p className="text-xl text-slate-600 text-center max-w-2xl leading-relaxed">
                {agenda.description}
              </p>
            )}
          </motion.div>
        )}
        {stage === "content" && (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col h-full"
          >
            <div className="glass-strong px-8 py-4 flex items-center justify-between shrink-0 border-b border-slate-200">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-2xl font-bold gradient-text leading-tight">
                  {agenda?.title}
                </h2>
              </div>
            </div>
            <div
              ref={viewerRefCallback}
              className="flex-1 overflow-y-auto overflow-x-hidden relative bg-slate-100/80"
            >
              {pdfReady && numPages > 0 ? (
                <div className="flex flex-col items-center gap-4 py-6">
                  {Array.from({ length: numPages }).map((_, i) => (
                    <canvas
                      key={i}
                      ref={(el) => {
                        canvasRefs.current[i] = el;
                      }}
                      className="rounded-lg shadow-lg shadow-slate-400/40 ring-1 ring-slate-300/90 bg-white"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function QaPhase({
  agenda,
  speaker,
}: {
  agenda: Agenda | null;
  speaker: Profile | null;
}) {
  return (
    <motion.div
      key="qa"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-full gap-10"
    >
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-3 text-sky-800">
          <MessageCircle className="w-7 h-7" />
          <span className="text-2xl font-bold tracking-wide">질의응답</span>
        </div>
        <h2 className="text-4xl font-bold text-slate-900 max-w-3xl">
          {agenda?.title}
        </h2>
      </div>

      <AnimatePresence mode="wait">
        {speaker ? (
          <motion.div
            key={speaker.id}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="relative flex flex-col items-center"
          >
            {/* Pulsing rings */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="absolute w-56 h-56 rounded-full border-2 border-sky-400/60 animate-pulse-ring" />
              <span
                className="absolute w-56 h-56 rounded-full border-2 border-cyan-400/45 animate-pulse-ring"
                style={{ animationDelay: "0.5s" }}
              />
            </div>

            <div className="glass-strong rounded-3xl px-16 py-12 flex flex-col items-center gap-4 relative z-10">
              <Mic className="w-10 h-10 text-blue-700" />
              <span className="text-sm font-semibold text-blue-800 tracking-widest uppercase">
                현재 발언자
              </span>
              <span className="text-5xl font-extrabold text-slate-900">
                {speaker.name}
              </span>
              <span className="text-xl text-slate-600">
                좌석 {speaker.assigned_seat}
              </span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-slate-500 text-2xl"
          >
            <span>질문을 기다리는 중</span>
            <motion.span
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ...
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function VotingPhase({
  agenda,
  seatGrid,
  timerSeconds,
  layout,
}: {
  agenda: Agenda | null;
  seatGrid: SeatVoteInfo[];
  timerSeconds: number | null;
  layout: SeatLayout;
}) {
  const seatMap = useMemo(
    () => new Map(seatGrid.map((s) => [s.seat, s])),
    [seatGrid],
  );
  const votedCount = seatGrid.filter((s) => s.voted).length;

  return (
    <motion.div
      key="voting"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center h-full py-8 gap-6"
    >
      <div className="flex flex-col items-center w-full max-w-5xl gap-5">
        <div className="text-center w-full px-4">
          <h2 className="text-3xl font-bold text-slate-900">
            {agenda?.title}
          </h2>
          <p className="text-slate-600 mt-1">
            {timerSeconds !== null && timerSeconds <= 0
              ? "집계 중..."
              : "투표가 진행 중입니다"}
          </p>
        </div>
        <div
          className={
            timerSeconds !== null
              ? "min-h-[11rem] w-full flex items-center justify-center"
              : "w-full flex items-center justify-center"
          }
        >
          {timerSeconds !== null && timerSeconds > 0 && (
            <TimerRing seconds={timerSeconds} />
          )}
          {timerSeconds !== null && timerSeconds <= 0 && <CountingDots />}
        </div>
      </div>

      <div className="glass rounded-xl px-6 py-3 flex items-center gap-3">
        <Vote className="w-5 h-5 text-blue-700" />
        <span className="text-lg font-semibold text-slate-900">
          <span className="text-blue-700">{votedCount}</span>
          <span className="text-slate-500">
            {" "}
            / {seatGrid.length}명 투표 완료
          </span>
        </span>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col gap-2">
          {Array.from({ length: layout.rows }, (_, r) => r + 1).map((row) => (
            <div key={row} className="flex justify-center">
              {layout.sections.map((size, sIdx) => {
                const startCol = layout.sections
                  .slice(0, sIdx)
                  .reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={sIdx}
                    className={`flex gap-2 ${sIdx > 0 ? "ml-5" : ""}`}
                  >
                    {Array.from({ length: size }, (_, c) => {
                      const col = startCol + c + 1;
                      const id = `${row}-${col}`;
                      const info = seatMap.get(id);
                      if (!info) {
                        return <div key={id} className="w-[54px] h-[54px]" />;
                      }
                      return (
                        <SeatCell
                          key={id}
                          info={info}
                          phase="VOTING"
                          flipDelay={0}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function ResultPhase({
  seatGrid,
  layout,
}: {
  seatGrid: SeatVoteInfo[];
  layout: SeatLayout;
}) {
  const [showResults, setShowResults] = useState(false);
  const seatMap = useMemo(
    () => new Map(seatGrid.map((s) => [s.seat, s])),
    [seatGrid],
  );

  const flipDelayMap = useMemo(() => {
    const map = new Map<string, number>();
    seatGrid.forEach((s) => {
      map.set(s.seat, Math.random() * 1500);
    });
    return map;
  }, [seatGrid]);

  const proCount = seatGrid.filter((s) => s.choice === "PRO").length;
  const conCount = seatGrid.filter((s) => s.choice === "CON").length;
  const total = proCount + conCount;
  const passed = proCount > conCount;
  const proPct = total > 0 ? (proCount / total) * 100 : 0;
  const conPct = total > 0 ? (conCount / total) * 100 : 0;

  useEffect(() => {
    const timer = setTimeout(() => setShowResults(true), 2800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center h-full py-8 gap-6 relative"
    >
      {showResults && passed && <Confetti />}

      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col gap-2">
          {Array.from({ length: layout.rows }, (_, r) => r + 1).map((row) => (
            <div key={row} className="flex justify-center">
              {layout.sections.map((size, sIdx) => {
                const startCol = layout.sections
                  .slice(0, sIdx)
                  .reduce((a, b) => a + b, 0);
                return (
                  <div
                    key={sIdx}
                    className={`flex gap-2 ${sIdx > 0 ? "ml-5" : ""}`}
                  >
                    {Array.from({ length: size }, (_, c) => {
                      const col = startCol + c + 1;
                      const id = `${row}-${col}`;
                      const info = seatMap.get(id);
                      if (!info) {
                        return <div key={id} className="w-[54px] h-[54px]" />;
                      }
                      return (
                        <SeatCell
                          key={id}
                          info={info}
                          phase="RESULT"
                          flipDelay={flipDelayMap.get(id) ?? 0}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showResults && (
          <motion.div
            initial={{ opacity: 0, y: 80, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 18 }}
            className="glass-strong rounded-3xl px-14 py-10 flex flex-col items-center gap-6 z-40"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 250,
                damping: 15,
                delay: 0.15,
              }}
              className="flex items-center gap-3"
            >
              {passed ? (
                <CheckCircle2 className="w-10 h-10 text-emerald-700" />
              ) : (
                <XCircle className="w-10 h-10 text-red-700" />
              )}
              <span
                className={`text-5xl font-extrabold ${passed ? "text-emerald-800" : "text-red-800"}`}
              >
                {passed ? "가결" : "부결"}
              </span>
            </motion.div>

            <div className="flex items-center gap-10 text-2xl font-bold">
              <span className="text-emerald-800">찬성 {proCount}표</span>
              <span className="text-slate-400">/</span>
              <span className="text-red-800">반대 {conCount}표</span>
            </div>

            <div className="w-96 flex flex-col gap-3">
              <div className="flex gap-1 h-10 rounded-lg overflow-hidden bg-slate-200 ring-1 ring-slate-300/80">
                <motion.div
                  className="bg-emerald-600 rounded-l-lg flex items-center justify-center text-sm font-bold text-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${proPct}%` }}
                  transition={{
                    type: "spring",
                    stiffness: 120,
                    damping: 18,
                    delay: 0.3,
                  }}
                >
                  {proPct > 10 && `${proPct.toFixed(1)}%`}
                </motion.div>
                <motion.div
                  className="bg-red-600 rounded-r-lg flex items-center justify-center text-sm font-bold text-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${conPct}%` }}
                  transition={{
                    type: "spring",
                    stiffness: 120,
                    damping: 18,
                    delay: 0.3,
                  }}
                >
                  {conPct > 10 && `${conPct.toFixed(1)}%`}
                </motion.div>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>찬성 {proPct.toFixed(1)}%</span>
                <span>반대 {conPct.toFixed(1)}%</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EndedPhase() {
  return (
    <motion.div
      key="ended"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center justify-center h-full gap-8 px-8 text-center relative"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-violet-200/50 rounded-full blur-[120px]" />
      </div>
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity }}
        className="w-24 h-24 rounded-3xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center z-10"
      >
        <Sparkles className="w-12 h-12 text-white" />
      </motion.div>
      <div className="z-10 space-y-4 max-w-3xl">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
          회의가 종료되었습니다
        </h1>
        <p className="text-xl md:text-2xl text-slate-600 leading-relaxed">
          참석자 여러분, 시간 내어 참여해 주셔서 감사합니다.
        </p>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Screen Page
// ---------------------------------------------------------------------------

export default function ScreenPage() {
  const supabase = useMemo(() => createClient(), []);

  const [meetingState, setMeetingState] = useState<MeetingState | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [speaker, setSpeaker] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [votes, setVotes] = useState<VoteType[]>([]);
  const [questions, setQuestions] = useState<
    {
      id: string;
      memo: string;
      status: string;
      profile?: { name: string; assigned_seat: string } | null;
    }[]
  >([]);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agendaIdRef = useRef<string | null>(null);
  agendaIdRef.current = meetingState?.current_agenda_id ?? null;

  const phase: Phase = meetingState?.phase ?? "IDLE";
  const presenceSet = usePresence("saerom-presence");
  const seatLayout: SeatLayout =
    meetingState?.seat_layout ?? DEFAULT_SEAT_LAYOUT;
  // ------ fetch meeting state ------
  const fetchMeetingState = useCallback(async () => {
    const { data } = await supabase
      .from("meeting_state")
      .select("*")
      .limit(1)
      .single();
    if (data) setMeetingState(data as MeetingState);
  }, [supabase]);

  // ------ fetch agenda ------
  const fetchAgenda = useCallback(
    async (agendaId: string) => {
      const { data } = await supabase
        .from("agendas")
        .select("*")
        .eq("id", agendaId)
        .single();
      if (data) setAgenda(data as Agenda);
    },
    [supabase],
  );

  // ------ fetch speaker ------
  const fetchSpeaker = useCallback(
    async (speakerId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", speakerId)
        .single();
      if (data) setSpeaker(data as Profile);
    },
    [supabase],
  );

  // ------ fetch attendee profiles ------
  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "attendee")
      .neq("assigned_seat", "");
    if (data) setProfiles(data as Profile[]);
  }, [supabase]);

  // ------ fetch votes for current agenda ------
  const fetchVotes = useCallback(
    async (agendaId: string) => {
      const { data } = await supabase
        .from("votes")
        .select("*")
        .eq("agenda_id", agendaId);
      if (data) setVotes(data as VoteType[]);
    },
    [supabase],
  );

  // ------ fetch questions ------
  const fetchQuestions = useCallback(
    async (agendaId: string) => {
      const { data } = await supabase
        .from("questions")
        .select(
          "*, profile:profiles!questions_user_id_fkey(name, assigned_seat)",
        )
        .eq("agenda_id", agendaId)
        .order("created_at");
      if (data) setQuestions(data as typeof questions);
    },
    [supabase],
  );

  // ------ timer ------
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!meetingState?.timer_end_at) {
      setTimerSeconds(null);
      return;
    }

    const calc = () => {
      const diff = Math.max(
        0,
        Math.floor(
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

  // ------ initial loads & reactions to meeting state changes ------
  useEffect(() => {
    fetchMeetingState();
    fetchProfiles();
  }, [fetchMeetingState, fetchProfiles]);

  useEffect(() => {
    if (meetingState?.current_agenda_id) {
      fetchAgenda(meetingState.current_agenda_id);
      fetchVotes(meetingState.current_agenda_id);
      fetchQuestions(meetingState.current_agenda_id);
    }
    if (meetingState?.current_speaker_id) {
      fetchSpeaker(meetingState.current_speaker_id);
    } else {
      setSpeaker(null);
    }
  }, [
    meetingState?.current_agenda_id,
    meetingState?.current_speaker_id,
    fetchAgenda,
    fetchVotes,
    fetchSpeaker,
    fetchQuestions,
  ]);

  // ------ Polling fallback: Realtime 미전달 시에도 meeting_state 동기화 (2.5초마다, 탭 포커스 시 즉시)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const poll = async () => {
      if (document.hidden) return;
      const { data } = await supabase
        .from("meeting_state")
        .select("*")
        .limit(1)
        .single();
      if (data)
        setMeetingState(
          (prev) =>
            (prev && typeof data === "object"
              ? { ...prev, ...(data as object) }
              : data) as MeetingState,
        );
    };
    const onVisible = () => poll();
    document.addEventListener("visibilitychange", onVisible);
    poll(); // 초기 1회
    const iv = setInterval(poll, 2500);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, [supabase]);

  // ------ realtime subscriptions ------
  useEffect(() => {
    const channel = supabase
      .channel("screen-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_state" },
        (payload) => {
          const raw =
            (payload as unknown as Record<string, unknown>).new ??
            (payload as unknown as Record<string, unknown>).record;
          if (raw && typeof raw === "object") {
            setMeetingState(
              (prev) => (prev ? { ...prev, ...raw } : raw) as MeetingState,
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        (payload) => {
          const newVote = payload.new as VoteType;
          if (
            agendaIdRef.current &&
            newVote.agenda_id === agendaIdRef.current
          ) {
            setVotes((prev) => {
              if (prev.some((v) => v.id === newVote.id)) return prev;
              return [...prev, newVote];
            });
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "questions" },
        () => {
          const aid = agendaIdRef.current;
          if (aid) fetchQuestions(aid);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          fetchProfiles();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]); // meetingState 의존 제거 → 구독 유지, 실시간 이벤트 누락 방지

  // ------ build seat grid ------
  const seatGrid: SeatVoteInfo[] = useMemo(() => {
    const sorted = [...profiles].sort((a, b) => {
      const pa = parseSeat(a.assigned_seat);
      const pb = parseSeat(b.assigned_seat);
      return pa.row !== pb.row ? pa.row - pb.row : pa.col - pb.col;
    });
    return sorted.map((p) => {
      const vote = votes.find((v) => v.user_id === p.id);
      return {
        seat: p.assigned_seat,
        name: p.name,
        voted: !!vote,
        choice: vote?.choice,
        online: presenceSet.has(p.id),
        userId: p.id,
      };
    });
  }, [profiles, votes, presenceSet]);

  // ------ render ------
  return (
    <div className="screen-page-light h-screen w-screen overflow-hidden relative text-slate-900">
      {/* Ambient gradient blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-sky-200/45 rounded-full blur-[180px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-violet-200/40 rounded-full blur-[160px]" />
      </div>

      {/* Phase views */}
      <AnimatePresence mode="wait">
        {phase === "IDLE" && !meetingState?.current_agenda_id && (
          <PreMeetingPhase
            profiles={profiles}
            presenceSet={presenceSet}
            layout={seatLayout}
          />
        )}
        {phase === "IDLE" && meetingState?.current_agenda_id && (
          <IdlePhase questions={questions} />
        )}
        {phase === "INTRO" && <IntroPhase agenda={agenda} />}
        {phase === "QA" && <QaPhase agenda={agenda} speaker={speaker} />}
        {phase === "VOTING" && (
          <VotingPhase
            agenda={agenda}
            seatGrid={seatGrid}
            timerSeconds={timerSeconds}
            layout={seatLayout}
          />
        )}
        {phase === "RESULT" && (
          <ResultPhase seatGrid={seatGrid} layout={seatLayout} />
        )}
        {phase === "ENDED" && <EndedPhase />}
      </AnimatePresence>
    </div>
  );
}
