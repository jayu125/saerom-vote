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
  FileText,
  Timer,
  AlertTriangle,
  ChevronRight,
  Clock,
} from "lucide-react";
import { usePresence } from "@/components/SeatMap";

const HUD_SPRING = { type: "spring" as const, stiffness: 400, damping: 30 };
const DOCK_SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };
const VOTE_EXPAND_EASE = [0.24, 0.72, 0.32, 0.98] as const;
const VOTE_INTERACTION_MS = {
  expand: 420,
  minLoading: 1000,
  checkDraw: 500,
  checkHold: 1000,
  doneExpand: 400,
} as const;
const PDF_INTRO_REVEAL_MS = 920;
const PDF_INTRO_EXPAND_MS = 720;
const BRAND_BLUE = "#2563EB";
const DONE_BLACK = "#0B0D12";
const PDF_INTRO_PATH = [
  { x: 1.16, y: -0.12 },
  { x: 0.54, y: 1.16 },
  { x: 0.82, y: -0.12 },
  { x: 0.12, y: 1.14 },
  { x: -0.16, y: -0.12 },
] as const;

type VoteInteractionStage =
  | "idle"
  | "expanding"
  | "submitting"
  | "confirming"
  | "done";
type PdfIntroStage = "hidden" | "standby" | "revealing" | "expanding" | "done";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function getIntroPathPoint(progress: number) {
  const bounded = clamp(progress, 0, 1);
  const segmentCount = PDF_INTRO_PATH.length - 1;
  const segmentProgress = bounded * segmentCount;
  const segmentIndex = Math.min(Math.floor(segmentProgress), segmentCount - 1);
  const localProgress = segmentProgress - segmentIndex;
  const current = PDF_INTRO_PATH[segmentIndex];
  const next = PDF_INTRO_PATH[segmentIndex + 1];

  return {
    x: lerp(current.x, next.x, localProgress),
    y: lerp(current.y, next.y, localProgress),
  };
}

function LoadingDots({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="h-2.5 w-2.5 rounded-full bg-blue-500"
          animate={{ y: [0, -8, 0] }}
          transition={{
            duration: 0.85,
            delay: dot * 0.12,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function VoteCheckIcon({ durationMs = VOTE_INTERACTION_MS.checkDraw }: { durationMs?: number }) {
  return (
    <motion.svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0"
      initial="hidden"
      animate="visible"
    >
      <motion.path
        d="M5 13L9.2 17L19 7.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={{
          hidden: { pathLength: 0, opacity: 1 },
          visible: {
            pathLength: 1,
            opacity: 1,
            transition: { duration: durationMs / 1000, ease: [0.22, 0.68, 0.2, 1] },
          },
        }}
      />
    </motion.svg>
  );
}

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
  const [voteInteraction, setVoteInteraction] = useState<{
    choice: "PRO" | "CON" | null;
    stage: VoteInteractionStage;
  }>({ choice: null, stage: "idle" });
  const [questionSuccess, setQuestionSuccess] = useState(false);
  const [questionDockReady, setQuestionDockReady] = useState(false);
  const [questionMemo, setQuestionMemo] = useState("");
  const [showMemoInput, setShowMemoInput] = useState(false);
  const [showConReasonSheet, setShowConReasonSheet] = useState(false);
  const [conReason, setConReason] = useState("");

  const pdfDocRef = useRef<any>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfScaleShellRef = useRef<HTMLDivElement>(null);
  const pdfScaleContentRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const introRafRef = useRef<number | null>(null);
  const introTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introAgendaKeyRef = useRef<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [scale, setScale] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [pdfPreviewReady, setPdfPreviewReady] = useState(false);
  const [pdfIntroStage, setPdfIntroStage] = useState<PdfIntroStage>("hidden");
  const [pdfRevealProgress, setPdfRevealProgress] = useState(0);
  const [pageBaseDims, setPageBaseDims] = useState<{ w: number; h: number }[]>(
    [],
  );

  const pinchRef = useRef({ dist: 0, scale: 1 });
  const scaleRef = useRef(1);
  const pendingScaleRef = useRef(1);
  const pinchRafRef = useRef<number | null>(null);
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
  const agendaId = meetingState?.current_agenda_id ?? null;
  const pdfContentMetrics = useMemo(() => {
    if (pageBaseDims.length === 0) return { width: 0, height: 0 };

    const gap = 24;
    return {
      width: Math.max(...pageBaseDims.map((dim) => dim.w)),
      height:
        pageBaseDims.reduce((sum, dim) => sum + dim.h, 0) +
        gap * Math.max(pageBaseDims.length - 1, 0),
    };
  }, [pageBaseDims]);
  const previewAspectRatio = useMemo(() => {
    const firstPage = pageBaseDims[0];
    return firstPage ? firstPage.h / firstPage.w : 1.414;
  }, [pageBaseDims]);
  const previewWidth = useMemo(() => {
    const basis = viewportWidth || 390;
    return clamp(basis * 0.56, 220, 360);
  }, [viewportWidth]);
  const previewHeight = useMemo(
    () => previewWidth * previewAspectRatio,
    [previewAspectRatio, previewWidth],
  );
  const previewExpandScale = useMemo(() => {
    const targetWidth =
      pageBaseDims[0]?.w ?? Math.max(previewWidth, (viewportWidth || 390) - 32);
    return clamp(targetWidth / previewWidth, 1, 2.45);
  }, [pageBaseDims, previewWidth, viewportWidth]);
  const previewExpandOffsetY = useMemo(() => {
    const basisHeight = viewportHeight || 844;
    const centeredTop = basisHeight / 2 - previewHeight / 2;
    const targetTop = 96;
    return targetTop - centeredTop;
  }, [previewHeight, viewportHeight]);
  const eraserSize = useMemo(
    () => clamp(previewWidth * 0.56, 148, 220),
    [previewWidth],
  );

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  // 실시간 회의 상태 동기화 구독
  useEffect(() => {
    const syncQuestionAvailability = () => {
      if (!profile || !agendaId) return;

      supabase
        .from("questions")
        .select("id")
        .eq("agenda_id", agendaId)
        .eq("user_id", profile.id)
        .in("status", ["waiting", "speaking"])
        .maybeSingle()
        .then(({ data }) => {
          const hasActiveQuestion = !!data;
          setHasAskedQuestion(hasActiveQuestion);
          if (!hasActiveQuestion) {
            setQuestionSuccess(false);
          }
        });
    };

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
          syncQuestionAvailability();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profile, agendaId]);

  useEffect(() => {
    if (phase === "ENDED") router.replace("/meeting/closed");
  }, [phase, router]);

  useEffect(() => {
    setHasVoted(false);
    setVoteSuccess(null);
    setVoteInteraction({ choice: null, stage: "idle" });
    setHasAskedQuestion(false);
    setQuestionSuccess(false);
    setQuestionDockReady(false);
    setQuestionMemo("");
    setShowMemoInput(false);
    setShowConReasonSheet(false);
    setConReason("");

    if (agendaId) {
      supabase
        .from("agendas")
        .select("*")
        .eq("id", agendaId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setAgenda(data as Agenda);
        });
      if (profile) {
        supabase
          .from("votes")
          .select("choice")
          .eq("agenda_id", agendaId)
          .eq("user_id", profile.id)
          .maybeSingle()
          .then(({ data }) => {
            setHasVoted(!!data);
            setVoteSuccess((data?.choice as "PRO" | "CON" | null) ?? null);
          });

        supabase
          .from("questions")
          .select("id")
          .eq("agenda_id", agendaId)
          .eq("user_id", profile.id)
          .in("status", ["waiting", "speaking"])
          .maybeSingle()
          .then(({ data }) => {
            const hasActiveQuestion = !!data;
            setHasAskedQuestion(hasActiveQuestion);
            if (!hasActiveQuestion) {
              setQuestionSuccess(false);
            }
          });
      }
    } else {
      setAgenda(null);
    }
  }, [agendaId, profile, supabase]);

  // --- PDF & Interaction (Original logic preserved) ---
  useEffect(() => {
    if (!agenda?.pdf_url) {
      setNumPages(0);
      setPageBaseDims([]);
      setPdfPreviewReady(false);
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
        scaleRef.current = 1;
        pendingScaleRef.current = 1;
        setPdfPreviewReady(false);
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
    let cancelled = false;

    async function renderPreview() {
      if (!pdfDocRef.current || !previewCanvasRef.current || previewWidth <= 0) {
        return;
      }

      try {
        const page = await pdfDocRef.current.getPage(1);
        if (cancelled) return;

        const devicePixelRatio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: 1 });
        const renderScale = (previewWidth * devicePixelRatio) / viewport.width;
        const renderViewport = page.getViewport({ scale: renderScale });
        const canvas = previewCanvasRef.current;

        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.width = renderViewport.width;
        canvas.height = renderViewport.height;
        canvas.style.width = `${previewWidth}px`;
        canvas.style.height = `${renderViewport.height / devicePixelRatio}px`;

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        if (!cancelled) {
          setPdfPreviewReady(true);
        }
      } catch {
        if (!cancelled) {
          setPdfPreviewReady(false);
        }
      }
    }

    renderPreview();

    return () => {
      cancelled = true;
    };
  }, [agenda?.pdf_url, numPages, pdfIntroStage, previewWidth]);

  useEffect(() => {
    const canvas = previewMaskCanvasRef.current;
    if (!canvas || previewWidth <= 0 || previewHeight <= 0) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.round(previewWidth * devicePixelRatio);
    const height = Math.round(previewHeight * devicePixelRatio);

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${previewWidth}px`;
    canvas.style.height = `${previewHeight}px`;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);

    if (pdfIntroStage === "hidden" || pdfIntroStage === "done") {
      return;
    }

    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);

    if (pdfIntroStage === "standby") {
      return;
    }

    if (pdfRevealProgress >= 0.985 || pdfIntroStage === "expanding") {
      context.clearRect(0, 0, width, height);
      return;
    }

    const radius = (eraserSize * devicePixelRatio) / 2;
    const segmentCount = PDF_INTRO_PATH.length - 1;
    const segmentProgress = clamp(pdfRevealProgress, 0, 1) * segmentCount;
    const completedSegments = Math.floor(segmentProgress);
    const currentSegmentProgress = segmentProgress - completedSegments;

    context.globalCompositeOperation = "destination-out";

    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const localProgress =
        segmentIndex < completedSegments
          ? 1
          : segmentIndex === completedSegments
            ? currentSegmentProgress
            : 0;

      if (localProgress <= 0) continue;

      const start = PDF_INTRO_PATH[segmentIndex];
      const end = PDF_INTRO_PATH[segmentIndex + 1];
      const distance = Math.hypot(end.x - start.x, end.y - start.y);
      const steps = Math.max(10, Math.ceil((distance * width) / (radius * 0.32)));

      for (let step = 0; step <= steps; step += 1) {
        const stepProgress = (step / steps) * localProgress;
        const pointX = lerp(start.x, end.x, stepProgress) * width;
        const pointY = lerp(start.y, end.y, stepProgress) * height;

        context.beginPath();
        context.arc(pointX, pointY, radius, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.globalCompositeOperation = "source-over";
  }, [eraserSize, pdfIntroStage, pdfRevealProgress, previewHeight, previewWidth]);

  useEffect(() => {
    if (introRafRef.current) {
      cancelAnimationFrame(introRafRef.current);
      introRafRef.current = null;
    }
    if (introTimeoutRef.current) {
      clearTimeout(introTimeoutRef.current);
      introTimeoutRef.current = null;
    }

    const currentAgendaKey = agendaId ? `${agendaId}:${agenda?.pdf_url ?? ""}` : null;

    if (!currentAgendaKey) {
      introAgendaKeyRef.current = null;
      setPdfIntroStage("hidden");
      setPdfRevealProgress(0);
      return;
    }

    if (phase === "IDLE" && agenda?.pdf_url) {
      introAgendaKeyRef.current = null;
      setPdfIntroStage("standby");
      setPdfRevealProgress(0);
      return;
    }

    if (phase === "INTRO" && pdfPreviewReady) {
      if (introAgendaKeyRef.current === currentAgendaKey) {
        return;
      }

      introAgendaKeyRef.current = currentAgendaKey;
      setPdfIntroStage("revealing");
      setPdfRevealProgress(0);

      let startedAt = 0;
      const animateReveal = (timestamp: number) => {
        if (!startedAt) startedAt = timestamp;

        const nextProgress = clamp(
          (timestamp - startedAt) / PDF_INTRO_REVEAL_MS,
          0,
          1,
        );
        setPdfRevealProgress(nextProgress);

        if (nextProgress < 1) {
          introRafRef.current = requestAnimationFrame(animateReveal);
          return;
        }

        setPdfIntroStage("expanding");
        introTimeoutRef.current = setTimeout(() => {
          setPdfIntroStage("done");
          setPdfRevealProgress(1);
        }, PDF_INTRO_EXPAND_MS);
      };

      introRafRef.current = requestAnimationFrame(animateReveal);
      return;
    }

    setPdfIntroStage("done");
    setPdfRevealProgress(1);

    return () => {
      if (introRafRef.current) {
        cancelAnimationFrame(introRafRef.current);
        introRafRef.current = null;
      }
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
        introTimeoutRef.current = null;
      }
    };
  }, [agenda?.pdf_url, agendaId, pdfPreviewReady, phase]);

  useEffect(() => {
    if (phase === "QA") {
      setQuestionDockReady(true);
      return;
    }

    if (phase !== "INTRO" || pdfIntroStage !== "done") {
      setQuestionDockReady(false);
      return;
    }

    const revealDelayMs =
      numPages > 1 ? 120 + 90 + 420 : 0;
    const timeout = setTimeout(() => {
      setQuestionDockReady(true);
    }, revealDelayMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [numPages, pdfIntroStage, phase]);

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

  const applyPdfScale = useCallback(
    (nextScale: number) => {
      if (pdfScaleShellRef.current) {
        pdfScaleShellRef.current.style.width = `${pdfContentMetrics.width * nextScale}px`;
        pdfScaleShellRef.current.style.height = `${pdfContentMetrics.height * nextScale}px`;
      }
      if (pdfScaleContentRef.current) {
        pdfScaleContentRef.current.style.transform = `translateX(-50%) scale(${nextScale})`;
      }
    },
    [pdfContentMetrics.height, pdfContentMetrics.width],
  );

  useEffect(() => {
    scaleRef.current = scale;
    pendingScaleRef.current = scale;
    applyPdfScale(scale);
  }, [scale, applyPdfScale]);

  useEffect(() => {
    return () => {
      if (pinchRafRef.current) cancelAnimationFrame(pinchRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (phase !== "VOTING" || !meetingState?.timer_end_at) {
      setTimerSeconds(null);
      return;
    }

    const tick = () => {
      const diff = Math.max(
        0,
        Math.ceil((new Date(meetingState.timer_end_at!).getTime() - Date.now()) / 1000),
      );
      setTimerSeconds(diff);
      if (diff <= 0 && timerRef.current) {
        clearInterval(timerRef.current);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 250);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [meetingState?.timer_end_at, phase]);

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
            scaleAtStart: scaleRef.current,
          };
        }
        pinchRef.current = {
          dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
          scale: scaleRef.current,
        };
      }
    },
    [],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && scrollRef.current) {
      e.preventDefault();
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
      pendingScaleRef.current = nextScale;
      if (pinchRafRef.current) cancelAnimationFrame(pinchRafRef.current);
      pinchRafRef.current = requestAnimationFrame(() => {
        applyPdfScale(nextScale);
        scrollRef.current!.scrollLeft = (scrollLeft + x) * ratio - x;
        scrollRef.current!.scrollTop = (scrollTop + y) * ratio - y;
        scaleRef.current = nextScale;
      });
    }
  }, [applyPdfScale]);

  const commitPinchScale = useCallback(() => {
    if (pinchRafRef.current) {
      cancelAnimationFrame(pinchRafRef.current);
      pinchRafRef.current = null;
    }
    const committedScale = pendingScaleRef.current;
    scaleRef.current = committedScale;
    setScale(committedScale);
  }, []);

  const submitVote = async (choice: "PRO" | "CON", reason?: string) => {
    if (hasVoted || voting || !meetingState?.current_agenda_id) return;
    setVoteInteraction({ choice, stage: "expanding" });
    setVoting(true);
    try {
      await wait(VOTE_INTERACTION_MS.expand);
      setVoteInteraction({ choice, stage: "submitting" });
      const loadingStartedAt = Date.now();
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
        const remainingLoading = Math.max(
          0,
          VOTE_INTERACTION_MS.minLoading - (Date.now() - loadingStartedAt),
        );
        if (remainingLoading > 0) await wait(remainingLoading);
        setHasVoted(true);
        setVoteSuccess(choice);
        setConReason("");
        setVoteInteraction({ choice, stage: "confirming" });
        await wait(VOTE_INTERACTION_MS.checkDraw);
        await wait(VOTE_INTERACTION_MS.checkHold);
        setVoteInteraction({ choice, stage: "done" });
      } else {
        setVoteInteraction({ choice: null, stage: "idle" });
      }
    } catch {
      setVoteInteraction({ choice: null, stage: "idle" });
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
        setQuestionMemo("");
      }
    } finally {
      setAskingQuestion(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen meeting-hud-dotgrid flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
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
          <LoadingDots className="justify-center" />
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
            className="w-full py-3 rounded-2xl bg-blue-600 text-white font-bold cursor-pointer hover:bg-blue-500 transition-colors"
          >
            돌아가기
          </button>
        </div>
      </div>
    );

  const shouldShowStandbyPreview = phase === "IDLE" && !!agenda?.pdf_url;
  const shouldShowIntroOverlay =
    phase === "INTRO" && !!agenda?.pdf_url && pdfIntroStage !== "done";
  const showPdfIntroCard =
    !!agenda?.pdf_url &&
    (shouldShowStandbyPreview ||
      shouldShowIntroOverlay ||
      pdfIntroStage === "standby" ||
      pdfIntroStage === "revealing" ||
      pdfIntroStage === "expanding");
  const attendeePdfHidden =
    phase === "IDLE" ||
    phase === "RESULT" ||
    (phase === "INTRO" && !!agenda?.pdf_url && pdfIntroStage !== "done");
  const isVoteWindowOpen = phase === "VOTING" && (timerSeconds ?? 0) > 0;
  const isStandbyView =
    !meetingState?.current_agenda_id || phase === "IDLE" || phase === "RESULT";
  const standbyLabel =
    phase === "IDLE" ? "안건 상정 준비중..." : "대기 중...";
  const activeVoteChoice = voteInteraction.choice ?? voteSuccess;
  const voteChoiceColor =
    activeVoteChoice === "CON" ? "#DC2626" : BRAND_BLUE;
  const isVoteAnimating = voteInteraction.stage !== "idle";
  const isVoteDone = voteInteraction.stage === "done" || (!isVoteAnimating && hasVoted);
  const eraserPoint =
    pdfIntroStage === "revealing"
      ? getIntroPathPoint(pdfRevealProgress)
      : null;
  const showPreviewCanvas = !!agenda?.pdf_url;
  const showOverlayCanvas =
    !!agenda?.pdf_url &&
    (pdfIntroStage === "standby" ||
      pdfIntroStage === "revealing" ||
      pdfIntroStage === "expanding");
  const stationMeta = profile?.assigned_seat
    ? `[ STATION: ${profile.assigned_seat.replace(/-/g, "_").toUpperCase()} ]`
    : "[ STATION: — ]";

  return (
    <div className="h-screen w-screen overflow-hidden relative meeting-hud-dotgrid text-white font-sans">
      {!isStandbyView && <div className="meeting-hud-scanline pointer-events-none" />}

      <div
        ref={scrollRef}
        className={`fixed inset-0 z-[2] overflow-auto transition-all ${scale === 1 ? "snap-y snap-mandatory" : ""}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={commitPinchScale}
        onTouchCancel={commitPinchScale}
        style={{
          touchAction: attendeePdfHidden ? "auto" : "pan-x pan-y",
        }}
      >
        {numPages > 0 && (
          <div
            className={`pt-24 pb-[32vh] px-2 mx-auto ${attendeePdfHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
            style={{
              width: "fit-content",
              minWidth: "100%",
            }}
          >
            <div
              ref={pdfScaleShellRef}
              className="relative mx-auto"
              style={{
                width: pdfContentMetrics.width * scale,
                height: pdfContentMetrics.height * scale,
              }}
            >
              <div
                ref={pdfScaleContentRef}
                className="absolute left-1/2 top-0 flex flex-col gap-6"
                style={{
                  width: pdfContentMetrics.width,
                  transform: `translateX(-50%) scale(${scale})`,
                  transformOrigin: "top center",
                }}
              >
                {Array.from({ length: numPages }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="snap-start"
                    style={{ scrollMarginTop: "100px" }}
                    initial={false}
                    animate={{
                      opacity:
                        i === 0 || phase !== "INTRO" || pdfIntroStage === "done"
                          ? 1
                          : 0,
                    }}
                    transition={{
                      duration: i === 0 ? 0 : 0.42,
                      delay:
                        i === 0 || phase !== "INTRO" || pdfIntroStage !== "done"
                          ? 0
                          : 0.12 + i * 0.09,
                      ease: "easeOut",
                    }}
                  >
                    <canvas
                      ref={(el) => {
                        canvasRefs.current[i] = el;
                      }}
                      className="select-none rounded-lg mx-auto shadow-2xl bg-white border border-white/10"
                    />
                  </motion.div>
                ))}
              </div>
            </div>
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
            <div className="w-8 h-8 rounded-lg bg-blue-600/15 flex items-center justify-center border border-blue-500/30">
              <Vote className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-left leading-tight">
              <p className="text-[8px] font-mono opacity-50">{stationMeta}</p>
              <p className="text-[11px] font-bold">
                대의원회 · {profile?.name}
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

      {showPdfIntroCard && (
        <div className="fixed inset-0 z-[18] pointer-events-none flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            style={{ transformOrigin: "top center" }}
            animate={
              pdfIntroStage === "expanding"
                ? {
                    opacity: 1,
                    scale: previewExpandScale,
                    y: previewExpandOffsetY,
                  }
                : {
                    opacity: 1,
                    scale: 1,
                    y: 0,
                  }
            }
            transition={
              pdfIntroStage === "expanding"
                ? {
                    duration: PDF_INTRO_EXPAND_MS / 1000,
                    ease: [0.82, 0.04, 0.18, 0.98],
                  }
                : { duration: 0.35, ease: "easeOut" }
            }
            className="flex flex-col items-center text-center"
            >
            <motion.div
              className="relative overflow-hidden rounded-[28px] border border-white/25 bg-white shadow-[0_24px_60px_rgba(0,0,0,0.34)]"
              animate={{
                borderRadius: pdfIntroStage === "expanding" ? 18 : 28,
              }}
              transition={{
                duration: PDF_INTRO_EXPAND_MS / 1000,
                ease: [0.82, 0.04, 0.18, 0.98],
              }}
              style={{ width: previewWidth, height: previewHeight }}
            >
              {shouldShowStandbyPreview && (
                <>
                  <div className="absolute inset-0 z-[3] bg-gradient-to-br from-slate-50/92 via-slate-100/92 to-slate-200/92" />
                  <div className="absolute left-[10%] top-[9%] z-[4] h-[76%] w-[80%] rounded-[22px] border border-slate-300/70 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]" />
                  <div className="absolute left-[16%] top-[16%] z-[4] h-[8%] w-[30%] rounded-full bg-slate-300/80" />
                  <div className="absolute left-[16%] top-[29%] z-[4] h-[3.8%] w-[58%] rounded-full bg-slate-200/95" />
                  <div className="absolute left-[16%] top-[36%] z-[4] h-[3.8%] w-[48%] rounded-full bg-slate-200/85" />
                  <div className="absolute left-[16%] top-[45%] z-[4] h-[22%] w-[68%] rounded-[18px] bg-slate-100/95" />
                  <div className="absolute left-[16%] top-[72%] z-[4] h-[3.8%] w-[54%] rounded-full bg-slate-200/90" />
                  <div className="absolute left-[16%] top-[79%] z-[4] h-[3.8%] w-[34%] rounded-full bg-slate-200/80" />
                  <motion.div
                    className="absolute inset-y-0 z-[5] -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/75 to-transparent"
                    animate={{ x: ["0%", "260%"] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </>
              )}
              <canvas
                ref={previewCanvasRef}
                className={`absolute inset-0 h-full w-full transition-opacity duration-150 ${
                  showPreviewCanvas && pdfPreviewReady ? "opacity-100" : "opacity-0"
                }`}
              />
              <canvas
                ref={previewMaskCanvasRef}
                className={`absolute inset-0 h-full w-full transition-opacity duration-150 ${
                  showOverlayCanvas ? "opacity-100" : "opacity-0"
                }`}
              />
              {eraserPoint && (
                <div
                  className="absolute rounded-full border border-white/70 bg-white/45 shadow-[0_10px_28px_rgba(15,23,42,0.24)] backdrop-blur-[1px]"
                  style={{
                    width: eraserSize,
                    height: eraserSize,
                    left: `calc(${eraserPoint.x * 100}% - ${eraserSize / 2}px)`,
                    top: `calc(${eraserPoint.y * 100}% - ${eraserSize / 2}px)`,
                  }}
                >
                  <div className="absolute inset-[18%] rounded-full border border-slate-400/25 bg-white/80" />
                </div>
              )}
            </motion.div>
            {shouldShowStandbyPreview && (
              <div className="mt-8 flex flex-col items-center gap-10 text-center">
                <p className="text-xl font-semibold tracking-wide text-slate-200">
                  안건 상정 준비중...
                </p>
                <LoadingDots />
              </div>
            )}
          </motion.div>
        </div>
      )}

      {isStandbyView && !showPdfIntroCard && (
        <div className="fixed inset-0 z-20 pointer-events-none flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-6 text-center"
          >
            <p className="text-xl font-semibold tracking-wide text-slate-200">
              {standbyLabel}
            </p>
            <LoadingDots />
          </motion.div>
        </div>
      )}

      {(phase !== "IDLE" || !!meetingState?.current_agenda_id) && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-8 bg-gradient-to-t from-black/80 to-transparent">
          <motion.div animate={dockShake} className="max-w-lg mx-auto">
            <AnimatePresence mode="wait">
              {((phase === "INTRO" && questionDockReady) || phase === "QA") && (
                <motion.div
                  key="qa"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={DOCK_SPRING}
                >
                  {hasAskedQuestion || questionSuccess ? (
                    <div className="p-4 rounded-2xl bg-black/85 text-center shadow-2xl">
                      <Check className="w-6 h-6 mx-auto mb-1 text-white" />
                      <p className="text-sm font-bold text-white">
                        질문 신청 완료
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowMemoInput(true)}
                      className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold flex items-center justify-center gap-3 cursor-pointer hover:bg-blue-500 shadow-xl transition-colors"
                    >
                      <MessageSquare className="w-5 h-5 text-white" />
                      질문하기
                      <ChevronRight className="w-4 h-4 opacity-70" />
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
                  {!isVoteWindowOpen && !isVoteAnimating && !isVoteDone ? (
                    <div className="p-5 rounded-2xl bg-black/80 text-center">
                      <p className="text-sm font-bold text-white/80">
                        투표 시작 대기 중...
                      </p>
                    </div>
                  ) : (
                    <motion.div
                      className="grid items-stretch"
                      animate={{
                        gridTemplateColumns:
                          activeVoteChoice === "PRO"
                            ? "1fr 0fr"
                            : activeVoteChoice === "CON"
                              ? "0fr 1fr"
                              : "1fr 1fr",
                        columnGap: activeVoteChoice ? 0 : 18,
                      }}
                      transition={{
                        duration:
                          voteInteraction.stage === "expanding"
                            ? VOTE_INTERACTION_MS.expand / 1000
                            : 0.24,
                        ease: VOTE_EXPAND_EASE,
                      }}
                    >
                      {(["PRO", "CON"] as const).map((choice) => {
                        const isSelected = activeVoteChoice === choice;
                        const isCollapsed = !!activeVoteChoice && !isSelected;
                        const isDoneButton = isSelected && isVoteDone;
                        const baseColor = choice === "PRO" ? BRAND_BLUE : "#DC2626";

                        return (
                          <motion.div
                            key={`animated-${choice}`}
                            className={`min-w-0 overflow-hidden ${
                              !activeVoteChoice
                                ? choice === "PRO"
                                  ? "pr-2"
                                  : "pl-2"
                                : ""
                            }`}
                            animate={{ opacity: isCollapsed ? 0 : 1 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                          >
                            <motion.button
                              type="button"
                              disabled={voting || hasVoted}
                              onClick={() =>
                                choice === "PRO"
                                  ? submitVote("PRO")
                                  : setShowConReasonSheet(true)
                              }
                              animate={{
                                height: isDoneButton ? 112 : 64,
                                backgroundColor: isDoneButton ? DONE_BLACK : baseColor,
                              }}
                              transition={{
                                height: {
                                  duration: isDoneButton
                                    ? VOTE_INTERACTION_MS.doneExpand / 1000
                                    : 0.24,
                                  ease: VOTE_EXPAND_EASE,
                                },
                                backgroundColor: {
                                  duration: 0.25,
                                  ease: "easeInOut",
                                },
                              }}
                              className={`relative w-full rounded-2xl px-6 text-white font-bold shadow-lg ${
                                isCollapsed ? "pointer-events-none" : "cursor-pointer"
                              }`}
                            >
                              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                                <AnimatePresence mode="wait" initial={false}>
                                  {!isSelected && (
                                    <motion.span
                                      key={`${choice}-idle`}
                                      initial={{ opacity: 0, y: -10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      exit={{ opacity: 0, y: 12 }}
                                      transition={{ duration: 0.2, ease: "easeOut" }}
                                    >
                                      {choice === "PRO" ? "찬성" : "반대"}
                                    </motion.span>
                                  )}
                                  {isSelected &&
                                    (voteInteraction.stage === "expanding" ||
                                      (voteInteraction.stage === "idle" && !isDoneButton)) && (
                                      <motion.span
                                        key={`${choice}-label`}
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 12 }}
                                        transition={{ duration: 0.22, ease: "easeOut" }}
                                      >
                                        {choice === "PRO" ? "찬성" : "반대"}
                                      </motion.span>
                                    )}
                                  {isSelected &&
                                    voteInteraction.stage === "submitting" && (
                                      <motion.div
                                        key={`${choice}-submitting`}
                                        initial={{ opacity: 0, y: -12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 12 }}
                                        transition={{ duration: 0.24, ease: "easeOut" }}
                                        className="flex items-center gap-2"
                                      >
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>투표 중</span>
                                      </motion.div>
                                    )}
                                  {isSelected &&
                                    voteInteraction.stage === "confirming" && (
                                      <motion.div
                                        key={`${choice}-confirming`}
                                        className="flex items-center justify-center text-white"
                                      >
                                        <VoteCheckIcon />
                                      </motion.div>
                                    )}
                                  {isSelected && isDoneButton && (
                                    <motion.div
                                      key={`${choice}-done`}
                                      initial={{ opacity: 1 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      transition={{ duration: 0.2 }}
                                      className="flex h-full w-full flex-col items-center justify-center gap-2 text-center"
                                    >
                                      <VoteCheckIcon durationMs={1} />
                                      <motion.span
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                          duration: 0.22,
                                          delay: VOTE_INTERACTION_MS.doneExpand / 1000,
                                          ease: "easeOut",
                                        }}
                                        className="text-sm font-bold tracking-wide"
                                      >
                                        투표 완료
                                      </motion.span>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </motion.button>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {showMemoInput && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMemoInput(false)}
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
                <h3 className="text-lg font-bold">질문 입력</h3>
              </div>
              <textarea
                value={questionMemo}
                onChange={(e) => setQuestionMemo(e.target.value)}
                placeholder="질문을 입력하세요..."
                className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm mb-6 focus:outline-none focus:border-blue-500/60"
              />
              <div className="flex gap-4">
                <button
                  onClick={() => setShowMemoInput(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 font-bold cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={submitQuestion}
                  disabled={askingQuestion}
                  className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-bold cursor-pointer transition-colors hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {askingQuestion ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      전송 중...
                    </>
                  ) : (
                    "질문 요청"
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
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
                  disabled={!conReason.trim() || voting}
                  className="flex-1 py-4 rounded-2xl bg-red-600 font-bold cursor-pointer transition-colors hover:bg-red-500 disabled:opacity-30 flex items-center justify-center gap-2"
                >
                  {voting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      전송 중...
                    </>
                  ) : (
                    "투표 완료"
                  )}
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

