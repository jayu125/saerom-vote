"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import Papa from "papaparse";
import type {
  Profile,
  Agenda,
  AgendaStatus,
  Vote,
  RegistrationRequest,
  MeetingState,
  SeatLayout,
} from "@/lib/types";
import { DEFAULT_SEAT_LAYOUT } from "@/lib/types";
import { initPdfWorker } from "@/lib/pdf-utils";
import SeatGrid from "@/components/SeatGrid";
import { PdfFirstPageThumbnail } from "@/components/PdfFirstPageThumbnail";
import { usePresence } from "@/components/SeatMap";
import {
  Users,
  FileText,
  BarChart3,
  Upload,
  Plus,
  Trash2,
  Search,
  Download,
  ChevronUp,
  ChevronDown,
  Vote as VoteIcon,
  Shield,
  LogOut,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  GripVertical,
  FileUp,
  UserPlus,
  Check,
  XCircle,
  Mail,
  Clock,
  LayoutGrid,
  Save,
  Minus,
} from "lucide-react";

type Tab = "students" | "agendas" | "requests" | "seatmap" | "reports";

type SupabaseClient = ReturnType<typeof createClient>;

export type ReportVoteResult = {
  pro: number;
  con: number;
  total: number;
  title: string;
  order_index: number;
  pdf_url: string | null;
};

interface VoteLog {
  id: string;
  agenda_id: string;
  agenda_title: string;
  user_name: string;
  user_email: string;
  student_id: string;
  choice: string;
  con_reason: string | null;
  created_at: string;
}

const tabItems: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "students", label: "학생 관리", icon: Users },
  { key: "agendas", label: "안건 관리", icon: FileText },
  { key: "requests", label: "가입 승인", icon: UserPlus },
  { key: "seatmap", label: "좌석 관리", icon: LayoutGrid },
  { key: "reports", label: "보고서", icon: BarChart3 },
];

const statusConfig: Record<
  AgendaStatus,
  { label: string; color: string; dot: string }
> = {
  active: {
    label: "진행 중",
    color: "text-accent-green",
    dot: "bg-accent-green",
  },
  pending: {
    label: "대기",
    color: "text-accent-amber",
    dot: "bg-accent-amber",
  },
  completed: { label: "완료", color: "text-text-muted", dot: "bg-text-muted" },
};

function PdfPreviewModal({
  url,
  onClose,
}: {
  url: string;
  onClose: () => void;
}) {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      try {
        const pdfjsLib = await initPdfWorker();
        if (!pdfjsLib) throw new Error("PDF worker unavailable");
        const res = await fetch(url);
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
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }
    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return;
    let cancelled = false;
    async function renderAll() {
      const pdf = pdfDocRef.current;
      const viewer = viewerRef.current;
      if (!pdf || !viewer) return;
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;
      const containerWidth = Math.min(viewer.clientWidth * 0.95, 900);
      for (let i = 0; i < numPages; i++) {
        const canvas = canvasRefs.current[i];
        if (!canvas || cancelled) continue;
        const page = await pdf.getPage(i + 1);
        const raw = page.getViewport({ scale: 1 });
        const fitScale = containerWidth / raw.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: fitScale * dpr });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${raw.width * fitScale}px`;
        canvas.style.height = `${raw.height * fitScale}px`;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport, canvas } as any)
          .promise;
      }
    }
    renderAll();
    return () => {
      cancelled = true;
    };
  }, [numPages]);

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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong rounded-2xl w-[90vw] max-w-4xl h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <span className="font-semibold">PDF 미리보기</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div ref={viewerRef} className="flex-1 overflow-y-auto px-4 py-6">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <AlertCircle className="w-12 h-12 text-accent-red mx-auto mb-2" />
                <p className="text-text-muted">PDF를 불러올 수 없습니다</p>
              </div>
            </div>
          )}
          {!loading && !error && numPages > 0 && (
            <div className="flex flex-col items-center gap-4">
              {Array.from({ length: numPages }).map((_, i) => (
                <canvas
                  key={i}
                  ref={(el) => {
                    canvasRefs.current[i] = el;
                  }}
                  className="shadow-lg shadow-black/30 rounded"
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: AgendaStatus }) {
  const cfg = statusConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}
    >
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, x: "-50%" }}
      animate={{ opacity: 1, y: 0, x: "-50%" }}
      exit={{ opacity: 0, y: -20, x: "-50%" }}
      className={`fixed top-6 left-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl ${
        type === "success"
          ? "bg-accent-green/20 border border-accent-green/30 text-accent-green"
          : "bg-accent-red/20 border border-accent-red/30 text-accent-red"
      }`}
    >
      {type === "success" ? (
        <CheckCircle2 className="w-5 h-5" />
      ) : (
        <AlertCircle className="w-5 h-5" />
      )}
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 hover:opacity-70 cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);

  const [activeTab, setActiveTab] = useState<Tab>("students");
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [csvUploading, setCsvUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const [voteLogs, setVoteLogs] = useState<VoteLog[]>([]);
  const [voteResults, setVoteResults] = useState<
    Record<string, ReportVoteResult>
  >({});
  const [reportsLoading, setReportsLoading] = useState(false);

  const [meetingState, setMeetingState] = useState<MeetingState | null>(null);
  const presenceSet = usePresence("saerom-presence");

  const showToast = useCallback(
    (message: string, type: "success" | "error") => {
      setToast({ message, type });
    },
    [],
  );

  async function fetchMeetingState() {
    const { data } = await supabase
      .from("meeting_state")
      .select("*")
      .limit(1)
      .single();
    if (data) setMeetingState(data as MeetingState);
  }

  async function fetchCurrentUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // [수정] .single() 대신 .maybeSingle() 사용
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      // 만약 ID로 조회되지 않는다면, 이메일로 다시 한번 시도 (안전장치)
      if (!data) {
        const { data: byEmail } = await supabase
          .from("profiles")
          .select("*")
          .eq("email", user.email!)
          .maybeSingle();
        if (byEmail) setCurrentUser(byEmail as Profile);
      } else {
        setCurrentUser(data as Profile);
      }
    }
  }

  async function fetchProfiles() {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("student_id");
    if (data) setProfiles(data as Profile[]);
  }

  async function fetchAgendas() {
    const { data } = await supabase
      .from("agendas")
      .select("*")
      .order("order_index");
    if (data) setAgendas(data as Agenda[]);
  }

  async function fetchRequests() {
    const { data } = await supabase
      .from("registration_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setRequests(data as RegistrationRequest[]);
      setPendingCount(
        (data as RegistrationRequest[]).filter((r) => r.status === "pending")
          .length,
      );
    }
  }

  const fetchRequestsRef = useRef(fetchRequests);
  const fetchProfilesRef = useRef(fetchProfiles);
  const fetchMeetingStateRef = useRef(fetchMeetingState);
  fetchRequestsRef.current = fetchRequests;
  fetchProfilesRef.current = fetchProfiles;
  fetchMeetingStateRef.current = fetchMeetingState;

  useEffect(() => {
    fetchCurrentUser();
    fetchProfiles();
    fetchAgendas();
    fetchRequests();
    fetchMeetingState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time 구독 — ref를 통해 항상 최신 fetch 함수 호출
  // Real-time 구독 — 모든 주요 테이블 감시
  useEffect(() => {
    // 채널은 단 하나만 만들고, 모든 변화를 감지합니다.
    const channel = supabase
      .channel("admin-monitor")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registration_requests" },
        () => {
          fetchRequestsRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          fetchProfilesRef.current();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        () => {
          // 보고서 탭이 아니더라도 일단 데이터는 최신화하는 것이 안전합니다.
          fetchReports();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]); // activeTab 삭제!!

  async function fetchReports() {
    setReportsLoading(true);
    try {
      // con_reason 컬럼이 아직 없는 DB에서도 동작하도록 * 사용 (명시 컬럼 나열 시 스키마 캐시 오류 가능)
      const { data: votes } = await supabase.from("votes").select("*");
      const { data: agendasData } = await supabase
        .from("agendas")
        .select("id, title, order_index, pdf_url")
        .order("order_index");
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, name, email, student_id");

      if (votes && agendasData && profilesData) {
        const agendaMap = new Map(
          (agendasData as { id: string; title: string }[]).map((a) => [
            a.id,
            a.title,
          ]),
        );
        const profileMap = new Map(
          profilesData.map(
            (p: {
              id: string;
              name: string;
              email: string;
              student_id: string;
            }) => [p.id, p],
          ),
        );

        const logs: VoteLog[] = (votes as Vote[]).map((v) => {
          const profile = profileMap.get(v.user_id) as
            | { name: string; email: string; student_id: string }
            | undefined;
          return {
            id: v.id,
            agenda_id: v.agenda_id,
            agenda_title:
              (agendaMap.get(v.agenda_id) as string) || "알 수 없음",
            user_name: profile?.name || "알 수 없음",
            user_email: profile?.email || "",
            student_id: profile?.student_id || "",
            choice: v.choice,
            con_reason:
              ("con_reason" in v ? (v as Vote).con_reason : null) ?? null,
            created_at: v.created_at,
          };
        });
        setVoteLogs(logs);

        const results: Record<string, ReportVoteResult> = {};
        for (const agenda of agendasData) {
          const a = agenda as {
            id: string;
            title: string;
            order_index: number;
            pdf_url: string | null;
          };
          const agendaVotes = (votes as Vote[]).filter(
            (v) => v.agenda_id === a.id,
          );
          results[a.id] = {
            pro: agendaVotes.filter((v) => v.choice === "PRO").length,
            con: agendaVotes.filter((v) => v.choice === "CON").length,
            total: agendaVotes.length,
            title: a.title,
            order_index: a.order_index ?? 0,
            pdf_url: a.pdf_url ?? null,
          };
        }
        setVoteResults(results);
      }
    } catch {
      showToast("보고서 데이터를 불러오는 중 오류가 발생했습니다.", "error");
    }
    setReportsLoading(false);
  }

  function handleCsvFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      showToast("CSV 파일만 업로드할 수 있습니다.", "error");
      return;
    }
    setCsvUploading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows = result.data as Record<string, string>[];
        if (rows.length === 0) {
          showToast("CSV 파일에 데이터가 없습니다.", "error");
          setCsvUploading(false);
          return;
        }
        try {
          const res = await fetch("/api/admin/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profiles: rows }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error);
          showToast(json.message, "success");
          fetchProfiles();
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : "업로드 실패",
            "error",
          );
        }
        setCsvUploading(false);
      },
      error: () => {
        showToast("CSV 파싱 중 오류가 발생했습니다.", "error");
        setCsvUploading(false);
      },
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleCsvFile(file);
  }

  async function handleRoleChange(profileId: string, newRole: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", profileId);
    if (error) {
      showToast("역할 변경 실패: " + error.message, "error");
    } else {
      showToast("역할이 변경되었습니다.", "success");
      fetchProfiles();
    }
  }

  async function handleDeleteProfile(profile: Profile) {
    if (
      !window.confirm(
        `${profile.name}(${profile.email})을(를) 삭제하시겠습니까?`,
      )
    )
      return;
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("id", profile.id);
    if (error) {
      showToast("삭제 실패: " + error.message, "error");
    } else {
      showToast(`${profile.name}님이 삭제되었습니다.`, "success");
      fetchProfiles();
    }
  }

  function validateSeat(seat: string): string | null {
    const layout: SeatLayout = meetingState?.seat_layout ?? DEFAULT_SEAT_LAYOUT;
    const totalCols = layout.sections.reduce((a, b) => a + b, 0);
    const parts = seat.split("-");
    if (parts.length !== 2)
      return `좌석 형식은 "행-열"이어야 합니다. (예: 3-14)`;
    const row = parseInt(parts[0], 10);
    const col = parseInt(parts[1], 10);
    if (isNaN(row) || isNaN(col)) return `좌석 번호는 숫자여야 합니다.`;
    if (row < 1 || row > layout.rows)
      return `행은 1~${layout.rows} 범위여야 합니다. (입력: ${row})`;
    if (col < 1 || col > totalCols)
      return `열은 1~${totalCols} 범위여야 합니다. (입력: ${col})`;
    const taken = profiles.find((p) => p.assigned_seat === seat);
    if (taken)
      return `좌석 ${seat}은(는) 이미 ${taken.name}님이 사용 중입니다.`;
    return null;
  }

  async function handleApproveRequest(req: RegistrationRequest, seat: string) {
    const validationError = validateSeat(seat);
    if (validationError) {
      showToast(validationError, "error");
      return;
    }

    const { error: insertError } = await supabase.from("profiles").insert({
      email: req.email,
      name: req.name,
      student_id: "",
      role: "attendee",
      assigned_seat: seat,
    });

    if (insertError) {
      showToast("프로필 생성 실패: " + insertError.message, "error");
      return;
    }

    await supabase
      .from("registration_requests")
      .update({ status: "approved" })
      .eq("id", req.id);
    showToast(
      `${req.name}님의 가입을 승인했습니다. (좌석: ${seat})`,
      "success",
    );
    fetchRequests();
    fetchProfiles();
  }

  async function handleRejectRequest(req: RegistrationRequest) {
    await supabase
      .from("registration_requests")
      .update({ status: "rejected" })
      .eq("id", req.id);
    showToast(`${req.name}님의 가입을 거절했습니다.`, "success");
    fetchRequests();
  }

  async function handleDeleteRequest(req: RegistrationRequest) {
    await supabase.from("registration_requests").delete().eq("id", req.id);
    fetchRequests();
  }

  function exportReportsCsv() {
    if (voteLogs.length === 0) {
      showToast("내보낼 데이터가 없습니다.", "error");
      return;
    }
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = "안건,이름,이메일,학번,투표,반대사유,일시\n";
    const rows = voteLogs.map((v) =>
      [
        esc(v.agenda_title),
        esc(v.user_name),
        esc(v.user_email),
        esc(v.student_id),
        v.choice === "PRO" ? "찬성" : "반대",
        esc(v.con_reason ?? ""),
        esc(new Date(v.created_at).toLocaleString("ko-KR")),
      ].join(","),
    );
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `투표결과_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV 파일이 다운로드되었습니다.", "success");
  }

  const filteredProfiles = profiles.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.email.toLowerCase().includes(q) ||
      (p.student_id || "").toLowerCase().includes(q) ||
      p.role.toLowerCase().includes(q) ||
      (p.assigned_seat || "").toLowerCase().includes(q)
    );
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const roleLabel: Record<string, string> = {
    admin: "관리자",
    facilitator: "진행자",
    attendee: "참석자",
  };

  const contentVariants = {
    initial: { opacity: 0, y: 12 },
    animate: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
    },
    exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* PDF Preview Modal */}
      <AnimatePresence>
        {pdfPreviewUrl && (
          <PdfPreviewModal
            url={pdfPreviewUrl}
            onClose={() => setPdfPreviewUrl(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      <header className="glass-strong sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
              <VoteIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text leading-tight">
                대위원회
              </h1>
              <p className="text-[10px] text-text-muted leading-tight">
                관리자 대시보드
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1 glass rounded-xl p-1">
            {tabItems.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  if (tab.key === "reports") fetchReports();
                }}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  activeTab === tab.key
                    ? "text-white"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-accent-blue/20 border border-accent-blue/30 rounded-lg"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <tab.icon className="w-4 h-4 relative z-10" />
                <span className="relative z-10 hidden sm:inline">
                  {tab.label}
                </span>
                {tab.key === "requests" && pendingCount > 0 && (
                  <span className="relative z-10 ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-accent-red text-white min-w-[18px] text-center">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="flex items-center gap-2 text-sm">
                <Shield className="w-4 h-4 text-accent-amber" />
                <span className="text-text-secondary hidden sm:inline">
                  {currentUser.name}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <AnimatePresence mode="wait">
          {activeTab === "students" && (
            <motion.div
              key="students"
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <StudentTab
                profiles={profiles}
                filteredProfiles={filteredProfiles}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                csvUploading={csvUploading}
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                handleDrop={handleDrop}
                handleCsvFile={handleCsvFile}
                fileInputRef={fileInputRef}
                roleLabel={roleLabel}
                onRoleChange={handleRoleChange}
                onDeleteProfile={handleDeleteProfile}
              />
            </motion.div>
          )}

          {activeTab === "agendas" && (
            <motion.div
              key="agendas"
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <AgendaTab
                agendas={agendas}
                supabase={supabase}
                showToast={showToast}
                fetchAgendas={fetchAgendas}
                onPdfPreview={(url) => setPdfPreviewUrl(url)}
              />
            </motion.div>
          )}

          {activeTab === "requests" && (
            <motion.div
              key="requests"
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <RequestsTab
                requests={requests}
                onApprove={handleApproveRequest}
                onReject={handleRejectRequest}
                onDelete={handleDeleteRequest}
                seatLayout={meetingState?.seat_layout ?? DEFAULT_SEAT_LAYOUT}
                profiles={profiles}
              />
            </motion.div>
          )}

          {activeTab === "seatmap" && (
            <motion.div
              key="seatmap"
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <SeatMapTab
                profiles={profiles}
                presenceSet={presenceSet}
                meetingState={meetingState}
                supabase={supabase}
                showToast={showToast}
                onLayoutSaved={fetchMeetingState}
              />
            </motion.div>
          )}

          {activeTab === "reports" && (
            <motion.div
              key="reports"
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <ReportsTab
                voteResults={voteResults}
                voteLogs={voteLogs}
                reportsLoading={reportsLoading}
                exportReportsCsv={exportReportsCsv}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ========================= Student Tab ========================= */

function StudentTab({
  profiles,
  filteredProfiles,
  searchQuery,
  setSearchQuery,
  csvUploading,
  isDragging,
  setIsDragging,
  handleDrop,
  handleCsvFile,
  fileInputRef,
  roleLabel,
  onRoleChange,
  onDeleteProfile,
}: {
  profiles: Profile[];
  filteredProfiles: Profile[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  csvUploading: boolean;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleCsvFile: (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  roleLabel: Record<string, string>;
  onRoleChange: (profileId: string, newRole: string) => Promise<void>;
  onDeleteProfile: (profile: Profile) => void;
}) {
  const [roleDropdownOpen, setRoleDropdownOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!roleDropdownOpen) return;
    function handleClickOutside() {
      setRoleDropdownOpen(null);
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [roleDropdownOpen]);

  const roleOptions: { value: string; label: string; color: string }[] = [
    {
      value: "attendee",
      label: "참석자",
      color: "bg-accent-blue/15 text-accent-blue",
    },
    {
      value: "facilitator",
      label: "진행자",
      color: "bg-accent-purple/15 text-accent-purple",
    },
    {
      value: "admin",
      label: "관리자",
      color: "bg-accent-amber/15 text-accent-amber",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">학생 관리</h2>
          <p className="text-text-secondary text-sm mt-1">
            등록된 학생 {profiles.length}명
          </p>
        </div>
      </div>

      <div
        className={`glass rounded-2xl p-8 border-2 border-dashed transition-colors text-center ${
          isDragging
            ? "border-accent-blue bg-accent-blue/5"
            : "border-border-glass hover:border-accent-blue/40"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {csvUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-accent-blue animate-spin" />
            <p className="text-text-secondary">업로드 중...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-accent-blue/10 flex items-center justify-center">
              <Upload className="w-7 h-7 text-accent-blue" />
            </div>
            <div>
              <p className="font-medium">
                CSV 파일을 드래그하거나 클릭하여 업로드
              </p>
              <p className="text-text-muted text-sm mt-1">
                필수 컬럼: email, name, student_id, role, assigned_seat
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-2.5 rounded-xl bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors text-sm font-medium cursor-pointer"
            >
              <FileUp className="w-4 h-4 inline mr-2" />
              파일 선택
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsvFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="이름, 이메일, 학번으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 rounded-xl glass bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue/40 transition-shadow"
        />
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-glass">
                <th className="px-6 py-4 text-left text-text-muted font-medium">
                  이름
                </th>
                <th className="px-6 py-4 text-left text-text-muted font-medium">
                  이메일
                </th>
                <th className="px-6 py-4 text-left text-text-muted font-medium">
                  학번
                </th>
                <th className="px-6 py-4 text-left text-text-muted font-medium">
                  역할
                </th>
                <th className="px-6 py-4 text-left text-text-muted font-medium">
                  좌석
                </th>
                <th className="px-6 py-4 text-left text-text-muted font-medium w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-text-muted"
                  >
                    {profiles.length === 0
                      ? "CSV 파일을 업로드하여 학생을 등록하세요."
                      : "검색 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p, i) => (
                  <motion.tr
                    key={p.id || p.email}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-border-glass/50 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-3.5 font-medium">{p.name}</td>
                    <td className="px-6 py-3.5 text-text-secondary">
                      {p.email}
                    </td>
                    <td className="px-6 py-3.5 text-text-secondary font-mono">
                      {p.student_id}
                    </td>
                    <td className="px-6 py-3.5 relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRoleDropdownOpen(
                            roleDropdownOpen === p.id ? null : p.id,
                          );
                        }}
                        className="cursor-pointer"
                      >
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 ${
                            p.role === "admin"
                              ? "bg-accent-amber/15 text-accent-amber"
                              : p.role === "facilitator"
                                ? "bg-accent-purple/15 text-accent-purple"
                                : "bg-accent-blue/15 text-accent-blue"
                          }`}
                        >
                          {roleLabel[p.role] || p.role}
                          <ChevronDown className="w-3 h-3" />
                        </span>
                      </button>
                      <AnimatePresence>
                        {roleDropdownOpen === p.id && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute left-6 top-full mt-1 z-20 glass rounded-xl border border-border-glass shadow-2xl overflow-hidden min-w-[120px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {roleOptions.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  onRoleChange(p.id, opt.value);
                                  setRoleDropdownOpen(null);
                                }}
                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium hover:bg-white/5 transition-colors cursor-pointer ${
                                  p.role === opt.value ? "bg-white/[0.03]" : ""
                                }`}
                              >
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-md ${opt.color}`}
                                >
                                  {opt.label}
                                </span>
                                {p.role === opt.value && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-accent-green ml-auto" />
                                )}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                    <td className="px-6 py-3.5 text-text-secondary font-mono">
                      {p.assigned_seat || "-"}
                    </td>
                    <td className="px-6 py-3.5">
                      <button
                        onClick={() => onDeleteProfile(p)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted hover:text-accent-red transition-colors cursor-pointer"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ========================= Agenda Tab ========================= */

function AgendaTab({
  agendas,
  supabase,
  showToast,
  fetchAgendas,
  onPdfPreview,
}: {
  agendas: Agenda[];
  supabase: SupabaseClient;
  showToast: (message: string, type: "success" | "error") => void;
  fetchAgendas: () => void;
  onPdfPreview: (url: string) => void;
}) {
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [pdfUploading, setPdfUploading] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<
    Record<string, { title: string; description: string }>
  >({});

  const bulkInputRef = useRef<HTMLInputElement>(null);
  const pdfRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    const vals: Record<string, { title: string; description: string }> = {};
    for (const a of agendas) {
      vals[a.id] = { title: a.title, description: a.description };
    }
    setEditValues(vals);
  }, [agendas]);

  async function handleBulkPdfUpload(files: FileList) {
    const pdfFiles = Array.from(files).filter(
      (f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfFiles.length === 0) {
      showToast("PDF 파일만 업로드할 수 있습니다.", "error");
      return;
    }

    setBulkUploading(true);
    setUploadProgress({ current: 0, total: pdfFiles.length });

    const maxOrder =
      agendas.length > 0 ? Math.max(...agendas.map((a) => a.order_index)) : -1;
    let successCount = 0;

    for (let i = 0; i < pdfFiles.length; i++) {
      const file = pdfFiles[i];
      setUploadProgress({ current: i + 1, total: pdfFiles.length });

      const title = file.name.replace(/\.pdf$/i, "");

      const uploadForm = new FormData();
      uploadForm.append("file", file);
      const uploadRes = await fetch("/api/admin/upload-pdf", {
        method: "POST",
        body: uploadForm,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        showToast(`PDF 업로드 실패 (${title}): ${err.error}`, "error");
        continue;
      }
      const { url: pdfUrl } = await uploadRes.json();

      const res = await fetch("/api/admin/agendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: "",
          status: "pending",
          order_index: maxOrder + 1 + i,
          pdf_url: pdfUrl,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        showToast(`안건 생성 실패 (${title}): ${err.error}`, "error");
        continue;
      }

      successCount++;
    }

    setBulkUploading(false);
    setUploadProgress({ current: 0, total: 0 });

    if (successCount > 0) {
      showToast(`${successCount}개 안건이 생성되었습니다.`, "success");
      fetchAgendas();
    }
  }

  async function uploadPdf(agendaId: string, file: File) {
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      showToast("PDF 파일만 업로드할 수 있습니다.", "error");
      return;
    }
    setPdfUploading(agendaId);
    const uploadForm = new FormData();
    uploadForm.append("file", file);
    const uploadRes = await fetch("/api/admin/upload-pdf", {
      method: "POST",
      body: uploadForm,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      showToast("PDF 업로드 실패: " + err.error, "error");
      setPdfUploading(null);
      return;
    }
    const { url: pdfUrl } = await uploadRes.json();

    const res = await fetch("/api/admin/agendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: agendaId, pdf_url: pdfUrl }),
    });

    if (!res.ok) {
      showToast("PDF URL 업데이트 실패", "error");
    } else {
      showToast("PDF가 업로드되었습니다.", "success");
    }
    setPdfUploading(null);
    fetchAgendas();
  }

  async function updateField(
    id: string,
    field: "title" | "description",
    value: string,
  ) {
    const agenda = agendas.find((a) => a.id === id);
    if (!agenda || agenda[field] === value) return;

    const res = await fetch("/api/admin/agendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: value }),
    });

    if (!res.ok) {
      showToast("수정 실패", "error");
    }
    fetchAgendas();
  }

  async function deleteAgenda(id: string) {
    if (
      !window.confirm(
        "이 안건을 삭제하시겠습니까? 관련 투표 데이터도 삭제됩니다.",
      )
    )
      return;

    const res = await fetch("/api/admin/agendas", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast("삭제 실패: " + err.error, "error");
    } else {
      showToast("안건이 삭제되었습니다.", "success");
      fetchAgendas();
    }
  }

  async function moveAgenda(id: string, direction: "up" | "down") {
    const idx = agendas.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= agendas.length) return;

    const current = agendas[idx];
    const swap = agendas[swapIdx];

    await fetch("/api/admin/agendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: current.id, order_index: swap.order_index }),
    });
    await fetch("/api/admin/agendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: swap.id, order_index: current.order_index }),
    });
    fetchAgendas();
  }

  function handlePdfDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDraggingPdf(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleBulkPdfUpload(files);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">안건 관리</h2>
          <p className="text-text-secondary text-sm mt-1">
            총 {agendas.length}개 안건
          </p>
        </div>
      </div>

      <div
        className={`glass rounded-2xl p-8 border-2 border-dashed transition-colors text-center ${
          isDraggingPdf
            ? "border-accent-blue bg-accent-blue/5"
            : "border-border-glass hover:border-accent-blue/40"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingPdf(true);
        }}
        onDragLeave={() => setIsDraggingPdf(false)}
        onDrop={handlePdfDrop}
      >
        {bulkUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-accent-blue animate-spin" />
            <p className="text-text-secondary">
              업로드 중... ({uploadProgress.current}/{uploadProgress.total})
            </p>
            <div className="w-64 h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-accent-blue rounded-full"
                initial={{ width: 0 }}
                animate={{
                  width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%`,
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-accent-blue/10 flex items-center justify-center">
              <FileUp className="w-7 h-7 text-accent-blue" />
            </div>
            <div>
              <p className="font-medium">
                PDF 파일을 드래그하거나 클릭하여 업로드
              </p>
              <p className="text-text-muted text-sm mt-1">
                여러 PDF를 한 번에 업로드하면 각각의 안건이 자동으로 생성됩니다
              </p>
              <p className="text-text-muted text-xs mt-0.5">
                파일명이 안건 제목으로 사용됩니다
              </p>
            </div>
            <button
              onClick={() => bulkInputRef.current?.click()}
              className="px-5 py-2.5 rounded-xl bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30 transition-colors text-sm font-medium cursor-pointer"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              PDF 파일 선택
            </button>
            <input
              ref={bulkInputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files;
                if (files && files.length > 0) handleBulkPdfUpload(files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        {agendas.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center text-text-muted">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>등록된 안건이 없습니다.</p>
            <p className="text-xs mt-1">
              PDF 파일을 업로드하여 안건을 생성하세요.
            </p>
          </div>
        ) : (
          agendas.map((agenda, idx) => (
            <motion.div
              key={agenda.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="glass rounded-2xl p-5 flex items-start gap-4 group"
            >
              <div className="w-16 h-20 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex flex-col items-center justify-center shrink-0">
                <FileText className="w-6 h-6 text-accent-blue/60" />
                <span className="text-[9px] text-accent-blue/60 font-medium mt-1">
                  PDF
                </span>
              </div>

              <div className="flex flex-col items-center gap-1 pt-1 opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
                <GripVertical className="w-4 h-4 text-text-muted" />
                <button
                  onClick={() => moveAgenda(agenda.id, "up")}
                  disabled={idx === 0}
                  className="p-0.5 hover:text-accent-blue disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveAgenda(agenda.id, "down")}
                  disabled={idx === agendas.length - 1}
                  className="p-0.5 hover:text-accent-blue disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted font-mono">
                    #{idx + 1}
                  </span>
                  <StatusBadge status={agenda.status} />
                </div>
                <input
                  type="text"
                  value={editValues[agenda.id]?.title ?? ""}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      [agenda.id]: {
                        ...prev[agenda.id],
                        title: e.target.value,
                      },
                    }))
                  }
                  onBlur={() => {
                    const val = editValues[agenda.id]?.title;
                    if (val !== undefined) updateField(agenda.id, "title", val);
                  }}
                  placeholder="안건 제목"
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-transparent hover:border-border-glass focus:border-accent-blue/40 text-text-primary font-semibold text-base placeholder:text-text-muted focus:outline-none transition-colors"
                />
                <textarea
                  value={editValues[agenda.id]?.description ?? ""}
                  onChange={(e) =>
                    setEditValues((prev) => ({
                      ...prev,
                      [agenda.id]: {
                        ...prev[agenda.id],
                        description: e.target.value,
                      },
                    }))
                  }
                  onBlur={() => {
                    const val = editValues[agenda.id]?.description;
                    if (val !== undefined)
                      updateField(agenda.id, "description", val);
                  }}
                  placeholder="안건 설명 (선택)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-transparent hover:border-border-glass focus:border-accent-blue/40 text-text-secondary text-sm placeholder:text-text-muted focus:outline-none transition-colors resize-none"
                />
                {agenda.pdf_url && (
                  <button
                    onClick={() => onPdfPreview(agenda.pdf_url!)}
                    className="inline-flex items-center gap-1.5 text-xs text-accent-blue hover:underline cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF 보기
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => pdfRefs.current[agenda.id]?.click()}
                  disabled={pdfUploading === agenda.id}
                  className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-accent-blue transition-colors cursor-pointer"
                  title="PDF 재업로드"
                >
                  {pdfUploading === agenda.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                </button>
                <input
                  ref={(el) => {
                    pdfRefs.current[agenda.id] = el;
                  }}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPdf(agenda.id, file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => deleteAgenda(agenda.id)}
                  className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-accent-red transition-colors cursor-pointer"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

/* ========================= Requests Tab ========================= */

function RequestsTab({
  requests,
  onApprove,
  onReject,
  onDelete,
  seatLayout,
  profiles,
}: {
  requests: RegistrationRequest[];
  onApprove: (req: RegistrationRequest, seat: string) => void;
  onReject: (req: RegistrationRequest) => void;
  onDelete: (req: RegistrationRequest) => void;
  seatLayout: SeatLayout;
  profiles: Profile[];
}) {
  const [seatInputs, setSeatInputs] = useState<Record<string, string>>({});
  const pending = requests.filter((r) => r.status === "pending");
  const processed = requests.filter((r) => r.status !== "pending");

  const totalCols = seatLayout.sections.reduce((a, b) => a + b, 0);

  function getSeatError(seat: string): string | null {
    if (!seat.trim()) return null;
    const parts = seat.split("-");
    if (parts.length !== 2) return "형식: 행-열";
    const row = parseInt(parts[0], 10);
    const col = parseInt(parts[1], 10);
    if (isNaN(row) || isNaN(col)) return "숫자만 입력";
    if (row < 1 || row > seatLayout.rows) return `행: 1~${seatLayout.rows}`;
    if (col < 1 || col > totalCols) return `열: 1~${totalCols}`;
    const taken = profiles.find((p) => p.assigned_seat === seat);
    if (taken) return `${taken.name} 사용 중`;
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">가입 승인</h2>
        <p className="text-text-secondary text-sm mt-1">
          학생 명단에 없는 사용자의 가입 요청을 관리합니다
        </p>
      </div>

      {/* Pending Requests */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          대기 중
          {pending.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-accent-amber/20 text-accent-amber">
              {pending.length}
            </span>
          )}
        </h3>

        {pending.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center text-text-muted">
            <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>대기 중인 가입 요청이 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pending.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-2xl p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-accent-amber/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-accent-amber" />
                    </div>
                    <div>
                      <p className="font-semibold">{req.name}</p>
                      <p className="text-text-secondary text-sm flex items-center gap-1.5">
                        <Mail className="w-3 h-3" />
                        {req.email}
                      </p>
                      <p className="text-text-muted text-xs mt-0.5">
                        {new Date(req.created_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                  <div className="flex flex-col gap-0.5">
                    <input
                      type="text"
                      value={seatInputs[req.id] || ""}
                      onChange={(e) =>
                        setSeatInputs((prev) => ({
                          ...prev,
                          [req.id]: e.target.value,
                        }))
                      }
                      placeholder={`행-열 (1~${seatLayout.rows}-1~${totalCols})`}
                      className={`w-36 px-3 py-2 rounded-xl bg-white/[0.04] border text-sm text-center text-text-primary placeholder:text-text-muted focus:outline-none transition-colors ${
                        seatInputs[req.id]?.trim() &&
                        getSeatError(seatInputs[req.id])
                          ? "border-accent-red/40 focus:border-accent-red/60"
                          : "border-white/10 focus:border-accent-blue/40"
                      }`}
                    />
                    {seatInputs[req.id]?.trim() &&
                      getSeatError(seatInputs[req.id]) && (
                        <span className="text-[10px] text-accent-red px-1">
                          {getSeatError(seatInputs[req.id])}
                        </span>
                      )}
                  </div>
                  <div className="flex-1" />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onApprove(req, seatInputs[req.id] || "")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      seatInputs[req.id]?.trim() &&
                      !getSeatError(seatInputs[req.id])
                        ? "bg-accent-green/20 text-accent-green hover:bg-accent-green/30"
                        : "bg-white/5 text-text-muted cursor-not-allowed"
                    }`}
                    disabled={
                      !seatInputs[req.id]?.trim() ||
                      !!getSeatError(seatInputs[req.id])
                    }
                  >
                    <Check className="w-4 h-4" />
                    승인
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onReject(req)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-red/20 text-accent-red text-sm font-medium hover:bg-accent-red/30 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    거절
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Processed Requests */}
      {processed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-text-secondary">
            처리 완료
          </h3>
          <div className="glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-glass">
                    <th className="px-6 py-4 text-left text-text-muted font-medium">
                      이름
                    </th>
                    <th className="px-6 py-4 text-left text-text-muted font-medium">
                      이메일
                    </th>
                    <th className="px-6 py-4 text-left text-text-muted font-medium">
                      상태
                    </th>
                    <th className="px-6 py-4 text-left text-text-muted font-medium">
                      요청일
                    </th>
                    <th className="px-6 py-4 text-left text-text-muted font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {processed.map((req) => (
                    <tr
                      key={req.id}
                      className="border-b border-border-glass/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-6 py-3.5 font-medium">{req.name}</td>
                      <td className="px-6 py-3.5 text-text-secondary">
                        {req.email}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                            req.status === "approved"
                              ? "bg-accent-green/15 text-accent-green"
                              : "bg-accent-red/15 text-accent-red"
                          }`}
                        >
                          {req.status === "approved" ? "승인됨" : "거절됨"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-text-muted text-xs font-mono">
                        {new Date(req.created_at).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-6 py-3.5">
                        <button
                          onClick={() => onDelete(req)}
                          className="p-1.5 rounded-lg hover:bg-white/5 text-text-muted hover:text-accent-red transition-colors cursor-pointer"
                          title="기록 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================= Seat Map Tab ========================= */

function SeatMapTab({
  profiles,
  presenceSet,
  meetingState,
  supabase,
  showToast,
  onLayoutSaved,
}: {
  profiles: Profile[];
  presenceSet: Set<string>;
  meetingState: MeetingState | null;
  supabase: SupabaseClient;
  showToast: (message: string, type: "success" | "error") => void;
  onLayoutSaved: () => void;
}) {
  const currentLayout: SeatLayout =
    meetingState?.seat_layout ?? DEFAULT_SEAT_LAYOUT;
  const [rows, setRows] = useState(currentLayout.rows);
  const [sections, setSections] = useState<number[]>([
    ...currentLayout.sections,
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const layout = meetingState?.seat_layout ?? DEFAULT_SEAT_LAYOUT;
    setRows(layout.rows);
    setSections([...layout.sections]);
  }, [meetingState?.seat_layout]);

  const totalCols = sections.reduce((a, b) => a + b, 0);
  const totalSeats = rows * totalCols;
  const assignedProfiles = profiles.filter((p) => p.assigned_seat);
  const onlineCount = assignedProfiles.filter((p) =>
    presenceSet.has(p.id),
  ).length;

  const previewLayout: SeatLayout = { rows, sections };

  function updateSection(idx: number, val: number) {
    const next = [...sections];
    next[idx] = Math.max(1, Math.min(20, val));
    setSections(next);
  }

  function addSection() {
    setSections([...sections, 6]);
  }

  function removeSection(idx: number) {
    if (sections.length <= 1) return;
    setSections(sections.filter((_, i) => i !== idx));
  }

  async function saveLayout() {
    if (!meetingState) {
      showToast("meeting_state를 찾을 수 없습니다.", "error");
      return;
    }
    setSaving(true);
    const layout: SeatLayout = { rows, sections };
    const { error } = await supabase
      .from("meeting_state")
      .update({ seat_layout: layout })
      .eq("id", meetingState.id);
    if (error) {
      showToast("레이아웃 저장 실패: " + error.message, "error");
    } else {
      showToast("좌석 레이아웃이 저장되었습니다.", "success");
      onLayoutSaved();
    }
    setSaving(false);
  }

  const isDirty =
    rows !== currentLayout.rows ||
    sections.length !== currentLayout.sections.length ||
    sections.some((s, i) => s !== currentLayout.sections[i]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">좌석 관리</h2>
          <p className="text-text-secondary text-sm mt-1">
            {totalSeats}석 · {assignedProfiles.length}명 배정됨 · {onlineCount}
            명 접속 중
          </p>
        </div>
      </div>

      {/* Layout editor */}
      <div className="glass rounded-2xl p-6 space-y-5">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-accent-blue" />
          레이아웃 설정
        </h3>

        <div className="flex flex-wrap items-end gap-6">
          <div>
            <label className="text-xs text-text-muted block mb-1.5">
              행 (세로 줄)
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={rows}
              onChange={(e) =>
                setRows(
                  Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                )
              }
              className="w-20 px-3 py-2 rounded-xl glass bg-transparent text-center text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
            />
          </div>

          <div className="flex-1">
            <label className="text-xs text-text-muted block mb-1.5">
              구역 (열 수) — 구역 사이는 통로
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {sections.map((size, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  {idx > 0 && (
                    <span className="text-text-muted text-xs px-1">|</span>
                  )}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={size}
                    onChange={(e) =>
                      updateSection(idx, parseInt(e.target.value) || 1)
                    }
                    className="w-16 px-2 py-2 rounded-xl glass bg-transparent text-center text-text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/40"
                  />
                  {sections.length > 1 && (
                    <button
                      onClick={() => removeSection(idx)}
                      className="p-1 rounded-lg hover:bg-accent-red/10 text-text-muted hover:text-accent-red cursor-pointer transition-colors"
                      title="구역 삭제"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addSection}
                className="px-3 py-2 rounded-xl bg-accent-blue/10 text-accent-blue text-xs font-medium hover:bg-accent-blue/20 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" />
                구역 추가
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <p className="text-sm text-text-secondary flex-1">
            총 {sections.length}개 구역 · {totalCols}열 × {rows}행 ={" "}
            {totalSeats}석
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={saveLayout}
            disabled={!isDirty || saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              isDirty
                ? "bg-accent-blue/20 text-accent-blue hover:bg-accent-blue/30"
                : "bg-white/5 text-text-muted cursor-not-allowed"
            }`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            레이아웃 저장
          </motion.button>
        </div>
      </div>

      {/* Grid preview */}
      <div className="glass rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">좌석 미리보기</h3>
        <div className="flex justify-center overflow-x-auto py-4">
          <SeatGrid
            layout={previewLayout}
            profiles={profiles}
            presenceSet={presenceSet}
            interactive
            cellSize={48}
            hideEmpty={!!meetingState?.current_agenda_id}
          />
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded bg-accent-blue/15 border border-accent-blue/25"
              style={{ boxShadow: "0 0 6px rgba(59,130,246,0.4)" }}
            />
            접속 중
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white/[0.06] border border-white/[0.08]" />
            오프라인
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-white/[0.03] border border-white/[0.06]" />
            빈 좌석
          </span>
        </div>
      </div>
    </div>
  );
}

/* ========================= Reports Tab ========================= */

const REPORTS_AGENDA_COLLAPSED_MAX = 6;

function ReportsTab({
  voteResults,
  voteLogs,
  reportsLoading,
  exportReportsCsv,
}: {
  voteResults: Record<string, ReportVoteResult>;
  voteLogs: VoteLog[];
  reportsLoading: boolean;
  exportReportsCsv: () => void;
}) {
  const [agendaGridExpanded, setAgendaGridExpanded] = useState(false);
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [detailChoiceFilter, setDetailChoiceFilter] = useState<
    "ALL" | "PRO" | "CON"
  >("ALL");

  const sortedEntries = useMemo(
    () =>
      Object.entries(voteResults).sort(
        (a, b) => (a[1].order_index ?? 0) - (b[1].order_index ?? 0),
      ),
    [voteResults],
  );

  const visibleAgendaEntries = agendaGridExpanded
    ? sortedEntries
    : sortedEntries.slice(0, REPORTS_AGENDA_COLLAPSED_MAX);

  const agendaLogs = useMemo(() => {
    if (!selectedAgendaId) return [];
    return voteLogs.filter((l) => l.agenda_id === selectedAgendaId);
  }, [voteLogs, selectedAgendaId]);

  const conReasonLines = useMemo(
    () =>
      agendaLogs
        .filter(
          (l) => l.choice === "CON" && l.con_reason && l.con_reason.trim(),
        )
        .map((l) => ({
          id: l.id,
          text: `${l.user_name} (${l.student_id || "학번 없음"}): ${l.con_reason}`,
        })),
    [agendaLogs],
  );

  const filteredDetailLogs = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    return agendaLogs.filter((log) => {
      if (detailChoiceFilter !== "ALL" && log.choice !== detailChoiceFilter)
        return false;
      if (!q) return true;
      const blob = [
        log.user_name,
        log.student_id,
        log.user_email,
        log.con_reason ?? "",
        log.choice,
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [agendaLogs, detailSearch, detailChoiceFilter]);

  useEffect(() => {
    if (!selectedAgendaId) return;
    setDetailSearch("");
    setDetailChoiceFilter("ALL");
  }, [selectedAgendaId]);

  if (reportsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
      </div>
    );
  }

  const selectedResult = selectedAgendaId
    ? voteResults[selectedAgendaId]
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">보고서</h2>
          <p className="text-text-secondary text-sm mt-1">
            안건 카드를 눌러 세부 통계·반대 사유·투표 기록을 확인하세요
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={exportReportsCsv}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-accent-green/20 text-accent-green text-sm font-medium hover:bg-accent-green/30 transition-colors cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          CSV 내보내기
        </motion.button>
      </div>

      {sortedEntries.length === 0 ? (
        <div className="glass rounded-2xl p-12 text-center text-text-muted">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>등록된 안건이 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleAgendaEntries.map(([agendaId, result]) => {
              const proPercent =
                result.total > 0 ? (result.pro / result.total) * 100 : 0;
              const conPercent =
                result.total > 0 ? (result.con / result.total) * 100 : 0;
              return (
                <motion.button
                  type="button"
                  key={agendaId}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => setSelectedAgendaId(agendaId)}
                  className="glass rounded-2xl p-5 space-y-4 text-left w-full cursor-pointer transition-all hover:ring-2 hover:ring-accent-blue/30 hover:bg-white/[0.04]"
                >
                  <h3 className="font-semibold line-clamp-2 text-text-primary">
                    {result.title}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-accent-blue">찬성</span>
                        <span className="font-mono text-text-secondary">
                          {result.pro}표 ({proPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${proPercent}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full bg-accent-blue rounded-full"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-accent-red">반대</span>
                        <span className="font-mono text-text-secondary">
                          {result.con}표 ({conPercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${conPercent}%` }}
                          transition={{
                            duration: 0.8,
                            ease: "easeOut",
                            delay: 0.1,
                          }}
                          className="h-full bg-accent-red rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted text-right">
                    총 {result.total}표 · 자세히
                  </div>
                </motion.button>
              );
            })}
          </div>
          {sortedEntries.length > REPORTS_AGENDA_COLLAPSED_MAX && (
            <button
              type="button"
              onClick={() => setAgendaGridExpanded((e) => !e)}
              className="w-full py-3 rounded-xl bg-white/5 text-text-secondary text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center gap-2 border border-white/10"
            >
              {agendaGridExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" /> 접기
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" /> 더보기 (
                  {sortedEntries.length - REPORTS_AGENDA_COLLAPSED_MAX}개 안건)
                </>
              )}
            </button>
          )}
        </div>
      )}

      {voteLogs.length > 0 && (
        <p className="text-xs text-text-muted text-center">
          전체 기록은 상단 CSV보내기로 저장할 수 있습니다.
        </p>
      )}

      <AnimatePresence>
        {selectedAgendaId && selectedResult && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            onClick={() => setSelectedAgendaId(null)}
          >
            <motion.div
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[90vh] flex flex-col glass-strong rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-text-primary leading-snug">
                    {selectedResult.title}
                  </h3>
                  <p className="text-xs text-text-muted mt-1">
                    세부 투표 통계 및 기록
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAgendaId(null)}
                  className="p-2 rounded-lg hover:bg-white/10 text-text-muted cursor-pointer shrink-0"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
                <div className="grid sm:grid-cols-[1fr_auto] gap-6 items-start">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      투표 통계
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-accent-blue">찬성</span>
                        <span className="font-mono">
                          {selectedResult.pro}표 (
                          {selectedResult.total > 0
                            ? (
                                (selectedResult.pro / selectedResult.total) *
                                100
                              ).toFixed(1)
                            : "0.0"}
                          %)
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-blue rounded-full transition-all"
                          style={{
                            width: `${selectedResult.total > 0 ? (selectedResult.pro / selectedResult.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-accent-red">반대</span>
                        <span className="font-mono">
                          {selectedResult.con}표 (
                          {selectedResult.total > 0
                            ? (
                                (selectedResult.con / selectedResult.total) *
                                100
                              ).toFixed(1)
                            : "0.0"}
                          %)
                        </span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-red rounded-full transition-all"
                          style={{
                            width: `${selectedResult.total > 0 ? (selectedResult.con / selectedResult.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-text-muted text-right">
                        총 {selectedResult.total}표
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center sm:items-end gap-2">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider w-full sm:text-right">
                      문서 미리보기
                    </p>
                    <PdfFirstPageThumbnail
                      pdfUrl={selectedResult.pdf_url}
                      maxWidth={160}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    반대 사유 모음
                  </p>
                  {conReasonLines.length === 0 ? (
                    <p className="text-sm text-text-muted py-2">
                      등록된 반대 사유가 없습니다.
                    </p>
                  ) : (
                    <ul className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5 text-sm">
                      {conReasonLines.map((line) => (
                        <li
                          key={line.id}
                          className="px-3 py-2 text-text-secondary leading-snug"
                        >
                          {line.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                    투표 기록 검색
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input
                        type="search"
                        value={detailSearch}
                        onChange={(e) => setDetailSearch(e.target.value)}
                        placeholder="이름, 학번, 이메일, 사유…"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
                      />
                    </div>
                    <div className="flex rounded-xl overflow-hidden border border-white/10 shrink-0">
                      {(["ALL", "PRO", "CON"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setDetailChoiceFilter(f)}
                          className={`px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                            detailChoiceFilter === f
                              ? "bg-accent-blue/25 text-accent-blue"
                              : "bg-white/[0.03] text-text-muted hover:bg-white/10"
                          }`}
                        >
                          {f === "ALL" ? "전체" : f === "PRO" ? "찬성" : "반대"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="glass rounded-xl overflow-hidden border border-white/10">
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-bg-primary/95 backdrop-blur z-10">
                          <tr className="border-b border-border-glass">
                            <th className="px-4 py-2 text-left text-text-muted font-medium text-xs">
                              이름
                            </th>
                            <th className="px-4 py-2 text-left text-text-muted font-medium text-xs">
                              학번
                            </th>
                            <th className="px-4 py-2 text-left text-text-muted font-medium text-xs">
                              투표
                            </th>
                            <th className="px-4 py-2 text-left text-text-muted font-medium text-xs">
                              반대 사유
                            </th>
                            <th className="px-4 py-2 text-left text-text-muted font-medium text-xs">
                              일시
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredDetailLogs.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-8 text-center text-text-muted text-sm"
                              >
                                조건에 맞는 기록이 없습니다.
                              </td>
                            </tr>
                          ) : (
                            filteredDetailLogs.map((log) => (
                              <tr
                                key={log.id}
                                className="border-b border-border-glass/40 hover:bg-white/[0.02]"
                              >
                                <td className="px-4 py-2 text-text-secondary whitespace-nowrap">
                                  {log.user_name}
                                </td>
                                <td className="px-4 py-2 text-text-secondary font-mono text-xs">
                                  {log.student_id}
                                </td>
                                <td className="px-4 py-2">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${
                                      log.choice === "PRO"
                                        ? "bg-accent-blue/15 text-accent-blue"
                                        : "bg-accent-red/15 text-accent-red"
                                    }`}
                                  >
                                    {log.choice === "PRO" ? "찬성" : "반대"}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-text-secondary text-xs max-w-[200px]">
                                  {log.con_reason ? (
                                    <span
                                      className="line-clamp-3"
                                      title={log.con_reason}
                                    >
                                      {log.con_reason}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="px-4 py-2 text-text-muted text-xs font-mono whitespace-nowrap">
                                  {new Date(log.created_at).toLocaleString(
                                    "ko-KR",
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
