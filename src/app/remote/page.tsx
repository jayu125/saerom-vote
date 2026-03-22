'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { Phase, MeetingState, Agenda, Question, Profile, SeatLayout, Vote as VoteRow } from '@/lib/types';
import { DEFAULT_SEAT_LAYOUT } from '@/lib/types';
import SeatGrid from '@/components/SeatGrid';
import { usePresence } from '@/components/SeatMap';
import {
  Vote,
  Radio,
  ChevronDown,
  Play,
  Square,
  Mic,
  Check,
  Timer,
  Users,
  BarChart3,
  Loader2,
  Wifi,
  WifiOff,
  MessageSquare,
  ListChecks,
  FileText,
  Megaphone,
  CircleDot,
  RotateCcw,
  SkipForward,
  Grid3x3,
  LogOut as LogOutIcon,
  ChevronRight,
  X,
  Flag,
} from 'lucide-react';

const PHASES: Phase[] = ['IDLE', 'INTRO', 'QA', 'VOTING', 'RESULT'];

const PHASE_META: Record<Phase, { label: string; labelKo: string; color: string; icon: React.ElementType }> = {
  IDLE:   { label: 'IDLE',   labelKo: '대기',   color: 'text-text-secondary', icon: CircleDot },
  INTRO:  { label: 'INTRO',  labelKo: '소개',   color: 'text-accent-blue',    icon: Megaphone },
  QA:     { label: 'Q&A',    labelKo: '질의',   color: 'text-accent-amber',   icon: MessageSquare },
  VOTING: { label: 'VOTE',   labelKo: '투표',   color: 'text-accent-green',   icon: Vote },
  RESULT: { label: 'RESULT', labelKo: '결과',   color: 'text-accent-purple',  icon: BarChart3 },
  ENDED:  { label: 'ENDED',  labelKo: '종료',   color: 'text-accent-red',     icon: Flag },
};

const TIMER_PRESETS = [30, 60, 90];

export default function RemoteControlPage() {
  const supabase = useMemo(() => createClient(), []);

  const [meetingState, setMeetingState] = useState<MeetingState | null>(null);
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [voteCount, setVoteCount] = useState(0);
  const [proCount, setProCount] = useState(0);
  const [conCount, setConCount] = useState(0);
  const [totalVoters, setTotalVoters] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState(60);
  const [showNextButton, setShowNextButton] = useState(false);
  const [endMeetingModalOpen, setEndMeetingModalOpen] = useState(false);
  const [endMeetingModalLoading, setEndMeetingModalLoading] = useState(false);
  const [endMeetingSummary, setEndMeetingSummary] = useState<
    { id: string; title: string; order_index: number; pro: number; con: number; total: number }[]
  >([]);
  const [remoteTab, setRemoteTab] = useState<'control' | 'seatmap'>('control');
  const [remoteProfiles, setRemoteProfiles] = useState<Profile[]>([]);
  const presenceSet = usePresence('saerom-presence');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agendaIdRef = useRef<string | null>(null);
  const fetchQuestionsRef = useRef<(id: string) => void>(() => {});
  const fetchVotesRef = useRef<(id: string) => void>(() => {});

  const currentPhase = meetingState?.phase ?? 'IDLE';
  const currentAgendaId = meetingState?.current_agenda_id;
  const currentAgenda = agendas.find((a) => a.id === currentAgendaId);

  // ─── Fetch initial data ───────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [{ data: msData }, { data: agData }, { count: voterCount }, { data: profileData }] = await Promise.all([
        supabase.from('meeting_state').select('*').single(),
        supabase.from('agendas').select('*').order('order_index'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'attendee').neq('assigned_seat', ''),
        supabase.from('profiles').select('*').eq('role', 'attendee').neq('assigned_seat', ''),
      ]);
      if (msData) setMeetingState(msData as MeetingState);
      if (agData) setAgendas(agData);
      if (profileData) setRemoteProfiles(profileData as Profile[]);
      setTotalVoters(voterCount ?? 0);
      setLoading(false);
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Fetch questions when agenda changes ──────────────────────────────
  const fetchQuestions = useCallback(async (agendaId: string) => {
    const { data } = await supabase
      .from('questions')
      .select('*, profile:profiles!questions_user_id_fkey(name, assigned_seat)')
      .eq('agenda_id', agendaId)
      .order('created_at');
    if (data) setQuestions(data);
  }, [supabase]);

  useEffect(() => {
    if (currentAgendaId) {
      fetchQuestions(currentAgendaId);
    } else {
      setQuestions([]);
    }
  }, [currentAgendaId, fetchQuestions]);

  // ─── Fetch vote counts ───────────────────────────────────────────────
  const fetchVotes = useCallback(async (agendaId: string) => {
    const { data } = await supabase
      .from('votes')
      .select('choice')
      .eq('agenda_id', agendaId);
    if (data) {
      setVoteCount(data.length);
      setProCount(data.filter((v) => v.choice === 'PRO').length);
      setConCount(data.filter((v) => v.choice === 'CON').length);
    }
  }, [supabase]);

  useEffect(() => {
    if (currentAgendaId && (currentPhase === 'VOTING' || currentPhase === 'RESULT')) {
      fetchVotes(currentAgendaId);
    }
  }, [currentAgendaId, currentPhase, fetchVotes]);

  // Refs를 항상 최신으로 유지 (구독 콜백에서 stale closure 방지)
  agendaIdRef.current = currentAgendaId ?? null;
  fetchQuestionsRef.current = fetchQuestions;
  fetchVotesRef.current = fetchVotes;

  // 개발 시 진단: ?debug=realtime 쿼리로 콘솔 로그 활성화
  const debugRealtime = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'realtime';

  // ─── Realtime subscriptions ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('remote-control')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_state' }, (payload) => {
        const p = payload as unknown as { new?: MeetingState; record?: MeetingState };
        const raw = p.new ?? p.record;
        if (raw) {
          if (debugRealtime) console.log('[remote] meeting_state payload:', payload);
          setMeetingState((prev) => (prev && typeof raw === 'object' ? { ...prev, ...raw } : raw) as MeetingState);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => {
        const aid = agendaIdRef.current;
        if (aid) fetchQuestionsRef.current(aid);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => {
        const aid = agendaIdRef.current;
        if (aid) fetchVotesRef.current(aid);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
        const { data } = await supabase.from('profiles').select('*').eq('role', 'attendee').neq('assigned_seat', '');
        if (data) setRemoteProfiles(data as Profile[]);
      })
      .subscribe((status) => {
        if (debugRealtime) console.log('[remote] subscription status:', status);
        setConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]); // deps 최소화: 구독을 절대 해제하지 않아 실시간 이벤트를 놓치지 않음

  // ─── Timer tick ───────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!meetingState?.timer_end_at) {
      setTimerRemaining(null);
      return;
    }
    const tick = () => {
      const end = new Date(meetingState.timer_end_at!).getTime();
      const diff = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimerRemaining(diff);
      if (diff <= 0 && timerRef.current) clearInterval(timerRef.current);
    };
    tick();
    timerRef.current = setInterval(tick, 250);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [meetingState?.timer_end_at]);

  // ─── Actions ──────────────────────────────────────────────────────────
  const msId = meetingState?.id;

  const setPhase = async (phase: Phase) => {
    if (!msId) return;
    setUpdating(true);
    try {
      const updates: Partial<MeetingState> = { phase };
      if (phase !== 'QA') updates.current_speaker_id = null;
      if (phase !== 'VOTING') updates.timer_end_at = null;
      const { error } = await supabase.from('meeting_state').update(updates).eq('id', msId);
      if (error) {
        if (debugRealtime) console.error('[remote] setPhase error:', error);
        return;
      }
      // 낙관적 업데이트: Realtime 미전달 시에도 즉시 UI 반영
      setMeetingState((prev) =>
        prev ? { ...prev, ...updates } : prev
      );

      if (currentAgendaId) {
        if (phase === 'INTRO') {
          await supabase.from('agendas').update({ status: 'active' }).eq('id', currentAgendaId);
        } else if (phase === 'RESULT') {
          await supabase.from('agendas').update({ status: 'completed' }).eq('id', currentAgendaId);
        }
      }
    } finally {
      setUpdating(false);
    }
  };

  const selectAgenda = async (agendaId: string) => {
    if (!msId) return;
    setUpdating(true);
    try {
      const next = {
        current_agenda_id: agendaId,
        phase: 'IDLE' as Phase,
        timer_end_at: null,
        current_speaker_id: null,
      };
      const { error } = await supabase.from('meeting_state').update(next).eq('id', msId);
      if (error) {
        if (debugRealtime) console.error('[remote] selectAgenda error:', error);
        return;
      }
      setMeetingState((prev) => (prev ? { ...prev, ...next } : prev));
      setAgendaOpen(false);
    } finally {
      setUpdating(false);
    }
  };

  const startTimer = async (seconds: number) => {
    if (!msId) return;
    const endAt = new Date(Date.now() + seconds * 1000).toISOString();
    const { error } = await supabase.from('meeting_state').update({ timer_end_at: endAt }).eq('id', msId);
    if (!error) setMeetingState((prev) => (prev ? { ...prev, timer_end_at: endAt } : prev));
  };

  const stopTimer = async () => {
    if (!msId) return;
    const { error } = await supabase.from('meeting_state').update({ timer_end_at: null }).eq('id', msId);
    if (!error) setMeetingState((prev) => (prev ? { ...prev, timer_end_at: null } : prev));
  };

  const designateSpeaker = async (question: Question) => {
    if (!msId) return;
    const [{ error: eqErr }, { error: msErr }] = await Promise.all([
      supabase.from('questions').update({ status: 'speaking' }).eq('id', question.id),
      supabase.from('meeting_state').update({ current_speaker_id: question.user_id }).eq('id', msId),
    ]);
    if (!msErr) setMeetingState((prev) => (prev ? { ...prev, current_speaker_id: question.user_id } : prev));
  };

  const finishSpeaker = async (question: Question) => {
    if (!msId) return;
    const [, { error }] = await Promise.all([
      supabase.from('questions').update({ status: 'done' }).eq('id', question.id),
      supabase.from('meeting_state').update({ current_speaker_id: null }).eq('id', msId),
    ]);
    if (!error) setMeetingState((prev) => (prev ? { ...prev, current_speaker_id: null } : prev));
  };

  const resetVotes = async () => {
    if (!currentAgendaId || !msId) return;
    if (!window.confirm('현재 안건의 모든 투표를 초기화하시겠습니까?\n이미 투표한 참석자도 다시 투표할 수 있게 됩니다.')) return;
    setUpdating(true);
    try {
      const [, { error }] = await Promise.all([
        supabase.from('votes').delete().eq('agenda_id', currentAgendaId),
        supabase.from('meeting_state').update({ timer_end_at: null }).eq('id', msId),
      ]);
      if (!error) {
        setMeetingState((prev) => (prev ? { ...prev, timer_end_at: null } : prev));
        setVoteCount(0);
        setProCount(0);
        setConCount(0);
      }
    } finally {
      setUpdating(false);
    }
  };

  const loadEndMeetingSummary = useCallback(async () => {
    setEndMeetingModalLoading(true);
    try {
      const [{ data: votes }, { data: agendasData }] = await Promise.all([
        supabase.from('votes').select('*'),
        supabase.from('agendas').select('id, title, order_index').order('order_index'),
      ]);
      const list = (agendasData ?? []) as { id: string; title: string; order_index: number }[];
      const vlist = (votes ?? []) as VoteRow[];
      const rows = list.map((a) => {
        const av = vlist.filter((x) => x.agenda_id === a.id);
        return {
          id: a.id,
          title: a.title,
          order_index: a.order_index,
          pro: av.filter((x) => x.choice === 'PRO').length,
          con: av.filter((x) => x.choice === 'CON').length,
          total: av.length,
        };
      });
      setEndMeetingSummary(rows);
    } finally {
      setEndMeetingModalLoading(false);
    }
  }, [supabase]);

  const openEndMeetingModal = useCallback(() => {
    setEndMeetingModalOpen(true);
    void loadEndMeetingSummary();
  }, [loadEndMeetingSummary]);

  const confirmEndMeeting = async () => {
    if (!msId) return;
    setUpdating(true);
    try {
      const next = {
        phase: 'ENDED' as Phase,
        current_agenda_id: null,
        timer_end_at: null,
        current_speaker_id: null,
      };
      const { error } = await supabase.from('meeting_state').update(next).eq('id', msId);
      if (error) {
        window.alert(
          '회의 종료 상태로 바꿀 수 없습니다. Supabase SQL Editor에서 supabase-migrations/007_meeting_phase_ended.sql 을 실행했는지 확인하세요.\n\n' +
            (error.message || ''),
        );
        if (debugRealtime) console.error('[remote] confirmEndMeeting error:', error);
        return;
      }
      setMeetingState((prev) => (prev ? { ...prev, ...next } : prev));
      setVoteCount(0);
      setProCount(0);
      setConCount(0);
      setQuestions([]);
      setEndMeetingModalOpen(false);
    } finally {
      setUpdating(false);
    }
  };

  const prepareNewMeeting = async () => {
    if (!msId) return;
    if (!window.confirm('새 회의를 준비합니다. 진행 단계가 대기로 초기화됩니다.')) return;
    setUpdating(true);
    try {
      const next = {
        phase: 'IDLE' as Phase,
        current_agenda_id: null,
        timer_end_at: null,
        current_speaker_id: null,
      };
      const { error } = await supabase.from('meeting_state').update(next).eq('id', msId);
      if (error) {
        if (debugRealtime) console.error('[remote] prepareNewMeeting error:', error);
        return;
      }
      setMeetingState((prev) => (prev ? { ...prev, ...next } : prev));
      setVoteCount(0);
      setProCount(0);
      setConCount(0);
      setQuestions([]);
    } finally {
      setUpdating(false);
    }
  };

  // ─── Show "next agenda" button after delay in RESULT phase ──────────
  useEffect(() => {
    if (currentPhase === 'RESULT') {
      const timeout = setTimeout(() => setShowNextButton(true), 4000);
      return () => clearTimeout(timeout);
    }
    setShowNextButton(false);
  }, [currentPhase]);

  const nextAgendaIdx = agendas.findIndex((a) => a.id === currentAgendaId);
  const nextAgenda = nextAgendaIdx >= 0 && nextAgendaIdx < agendas.length - 1
    ? agendas[nextAgendaIdx + 1]
    : null;

  // ─── Helpers ──────────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const timerProgress = (() => {
    if (timerRemaining === null || !meetingState?.timer_end_at) return 0;
    const endMs = new Date(meetingState.timer_end_at).getTime();
    const totalDuration = Math.round((endMs - (Date.now() - timerRemaining * 1000)) / 1000);
    if (totalDuration <= 0) return 0;
    return Math.min(1, timerRemaining / totalDuration);
  })();

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
          <p className="text-text-secondary text-sm">로딩 중...</p>
        </motion.div>
      </div>
    );
  }

  const waitingQuestions = questions.filter((q) => q.status === 'waiting');
  const speakingQuestion = questions.find((q) => q.status === 'speaking');
  const doneQuestions = questions.filter((q) => q.status === 'done');

  const proPercent = voteCount > 0 ? Math.round((proCount / voteCount) * 100) : 0;
  const conPercent = voteCount > 0 ? Math.round((conCount / voteCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-bg-primary pb-8">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="glass-strong sticky top-0 z-50 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold gradient-text leading-tight">SAEROM VOTING</h1>
              <p className="text-[10px] text-text-muted">진행자 컨트롤</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center glass rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setRemoteTab('control')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  remoteTab === 'control' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                진행
              </button>
              <button
                onClick={() => setRemoteTab('seatmap')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  remoteTab === 'seatmap' ? 'bg-accent-blue/20 text-accent-blue' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Grid3x3 className="w-3.5 h-3.5" />
                좌석
              </button>
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              currentPhase === 'IDLE'   ? 'bg-text-secondary/10 text-text-secondary' :
              currentPhase === 'INTRO'  ? 'bg-accent-blue/15 text-accent-blue' :
              currentPhase === 'QA'     ? 'bg-accent-amber/15 text-accent-amber' :
              currentPhase === 'VOTING' ? 'bg-accent-green/15 text-accent-green' :
              currentPhase === 'RESULT' ? 'bg-accent-purple/15 text-accent-purple' :
              currentPhase === 'ENDED'  ? 'bg-accent-red/15 text-accent-red' :
                                          'bg-text-secondary/10 text-text-secondary'
            }`}>
              {PHASE_META[currentPhase].labelKo}
            </span>
            {currentPhase !== 'ENDED' && currentAgendaId && (
              <button
                type="button"
                onClick={openEndMeetingModal}
                className="p-1.5 rounded-lg hover:bg-accent-red/10 text-text-muted hover:text-accent-red transition-colors cursor-pointer"
                title="회의 종료 (안건별 결과 확인)"
              >
                <LogOutIcon className="w-4 h-4" />
              </button>
            )}
            <span className="relative flex h-2.5 w-2.5" title={connected ? '연결됨' : '연결 끊김'}>
              {connected && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75 animate-ping" />
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${connected ? 'bg-accent-green' : 'bg-accent-red'}`} />
            </span>
          </div>
        </div>
      </header>

      {remoteTab === 'seatmap' && (
        <main className="max-w-3xl mx-auto px-4 mt-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Grid3x3 className="w-5 h-5 text-accent-blue" />
                실시간 좌석 현황
              </h2>
              <span className="text-xs text-text-muted">
                {remoteProfiles.filter((p) => presenceSet.has(p.id)).length}/{remoteProfiles.length}명 접속
              </span>
            </div>
            <div className="flex justify-center overflow-x-auto py-4">
              <SeatGrid
                layout={(meetingState?.seat_layout as SeatLayout) ?? DEFAULT_SEAT_LAYOUT}
                profiles={remoteProfiles}
                presenceSet={presenceSet}
                interactive
                cellSize={46}
                hideEmpty={!!currentAgendaId}
              />
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 text-xs text-text-muted">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-accent-blue/15 border border-accent-blue/25" style={{ boxShadow: '0 0 6px rgba(59,130,246,0.4)' }} />
                접속 중
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-white/[0.06] border border-white/[0.08]" />
                오프라인
              </span>
            </div>
          </motion.div>
        </main>
      )}

      {remoteTab === 'control' && (
        <main className="max-w-3xl mx-auto px-4 mt-4 space-y-4">
          {currentPhase === 'ENDED' ? (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-8 text-center space-y-4"
            >
              <Flag className="w-14 h-14 text-accent-purple mx-auto" />
              <h2 className="text-xl font-bold text-text-primary">회의가 종료되었습니다</h2>
              <p className="text-sm text-text-secondary leading-relaxed px-2">
                참석자 화면은 감사 메시지를 약 5초간 보여준 뒤 홈으로 이동합니다.
              </p>
              <button
                type="button"
                onClick={() => void prepareNewMeeting()}
                className="w-full max-w-sm mx-auto py-3.5 rounded-xl bg-gradient-to-r from-accent-blue to-accent-cyan text-white font-semibold cursor-pointer active:scale-[0.98] transition-transform"
              >
                새 회의 준비 (대기 화면)
              </button>
            </motion.section>
          ) : (
          <>
        {/* ── Agenda Selector ───────────────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <button
            onClick={() => setAgendaOpen(!agendaOpen)}
            className="w-full glass rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-5 h-5 text-accent-cyan shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-[10px] text-text-muted uppercase tracking-wider">안건 선택</p>
                <p className="text-sm font-medium text-text-primary truncate">
                  {currentAgenda ? currentAgenda.title : '안건을 선택하세요'}
                </p>
              </div>
            </div>
            <motion.div animate={{ rotate: agendaOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-5 h-5 text-text-muted" />
            </motion.div>
          </button>

          <AnimatePresence>
            {agendaOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="glass rounded-2xl mt-2 divide-y divide-white/5 overflow-hidden">
                  {agendas.map((agenda) => (
                    <button
                      key={agenda.id}
                      onClick={() => selectAgenda(agenda.id)}
                      className={`w-full text-left px-4 py-3.5 flex items-center gap-3 transition-colors active:bg-white/5 ${
                        agenda.id === currentAgendaId ? 'bg-accent-blue/10' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                        agenda.status === 'completed' ? 'bg-accent-green/20 text-accent-green' :
                        agenda.status === 'active'    ? 'bg-accent-blue/20 text-accent-blue' :
                                                        'bg-white/10 text-text-muted'
                      }`}>
                        {agenda.status === 'completed' ? <Check className="w-3.5 h-3.5" /> : agenda.order_index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{agenda.title}</p>
                        <p className="text-xs text-text-muted truncate">{agenda.description}</p>
                      </div>
                    </button>
                  ))}
                  {agendas.length === 0 && (
                    <p className="text-center text-text-muted text-sm py-6">등록된 안건이 없습니다</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ── Phase Stepper ─────────────────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-4"
        >
          <p className="text-[10px] text-text-muted uppercase tracking-wider mb-3">진행 단계</p>

          {/* Stepper track */}
          <div className="flex items-center gap-1 mb-4">
            {PHASES.map((phase, i) => {
              const isCurrent = phase === currentPhase;
              const isPast = PHASES.indexOf(currentPhase) > i;
              return (
                <div key={phase} className="flex items-center flex-1">
                  <div className={`h-1.5 w-full rounded-full transition-colors duration-300 ${
                    isCurrent ? 'bg-accent-blue' : isPast ? 'bg-accent-blue/40' : 'bg-white/10'
                  }`} />
                </div>
              );
            })}
          </div>

          {/* Phase buttons */}
          <div className="grid grid-cols-5 gap-2">
            {PHASES.map((phase) => {
              const meta = PHASE_META[phase];
              const Icon = meta.icon;
              const isCurrent = phase === currentPhase;
              const isDisabled = !currentAgendaId || updating;

              return (
                <motion.button
                  key={phase}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => !isDisabled && setPhase(phase)}
                  disabled={isDisabled}
                  className={`relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-all ${
                    isCurrent
                      ? 'bg-white/10 ring-1 ring-accent-blue/50'
                      : 'hover:bg-white/[0.04] active:bg-white/[0.06]'
                  } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {isCurrent && (
                    <motion.div
                      layoutId="phase-glow"
                      className="absolute inset-0 rounded-xl bg-accent-blue/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon className={`w-5 h-5 relative z-10 ${isCurrent ? meta.color : 'text-text-muted'}`} />
                  <span className={`text-[10px] font-semibold relative z-10 ${isCurrent ? 'text-text-primary' : 'text-text-muted'}`}>
                    {meta.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        {/* ── Phase-specific content ────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {/* INTRO / QA Phase: Question Queue */}
          {(currentPhase === 'INTRO' || currentPhase === 'QA') && (
            <motion.section
              key="qa"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-3"
            >
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-accent-amber" />
                    <p className="text-sm font-semibold">질문 대기열</p>
                  </div>
                  <span className="text-xs text-text-muted">{waitingQuestions.length}명 대기</span>
                </div>

                {/* Currently speaking */}
                {speakingQuestion && (
                  <div className="mb-3 p-3 rounded-xl bg-accent-amber/10 border border-accent-amber/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-accent-amber opacity-75 animate-ping" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-amber" />
                        </span>
                        <div>
                          <p className="text-sm font-medium">{speakingQuestion.profile?.name ?? '알 수 없음'}</p>
                          <p className="text-[10px] text-text-muted">좌석 {speakingQuestion.profile?.assigned_seat}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => finishSpeaker(speakingQuestion)}
                        className="px-3 py-1.5 rounded-lg bg-accent-green/15 text-accent-green text-xs font-medium active:scale-95 transition-transform cursor-pointer"
                      >
                        <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 완료</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Waiting list */}
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {waitingQuestions.length === 0 && !speakingQuestion && (
                    <p className="text-center text-text-muted text-xs py-6">질문 요청이 없습니다</p>
                  )}
                  {waitingQuestions.map((q, i) => (
                    <motion.div
                      key={q.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="w-6 h-6 rounded-full bg-white/10 text-[10px] font-bold flex items-center justify-center text-text-muted shrink-0">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{q.profile?.name ?? '알 수 없음'}</p>
                          <p className="text-[10px] text-text-muted">좌석 {q.profile?.assigned_seat}</p>
                          {q.memo && (
                            <p className="text-[10px] text-accent-cyan mt-0.5 truncate">
                              메모: {q.memo}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => designateSpeaker(q)}
                        disabled={!!speakingQuestion}
                        className="px-3 py-1.5 rounded-lg bg-accent-amber/15 text-accent-amber text-xs font-medium active:scale-95 transition-transform disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shrink-0 ml-2"
                      >
                        <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> 발언 지명</span>
                      </button>
                    </motion.div>
                  ))}
                </div>

                {/* Done list */}
                {doneQuestions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <p className="text-[10px] text-text-muted mb-2">발언 완료 ({doneQuestions.length})</p>
                    <div className="space-y-1.5">
                      {doneQuestions.map((q) => (
                        <div key={q.id} className="flex items-center gap-2 text-xs text-text-muted opacity-60">
                          <Check className="w-3 h-3 text-accent-green" />
                          <span>{q.profile?.name}</span>
                          <span className="text-[10px]">({q.profile?.assigned_seat})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.section>
          )}

          {/* VOTING Phase: Timer + Vote Monitor */}
          {currentPhase === 'VOTING' && (
            <motion.section
              key="voting"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-3"
            >
              {/* Timer */}
              <div className="glass rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Timer className="w-4 h-4 text-accent-green" />
                  <p className="text-sm font-semibold">투표 타이머</p>
                </div>

                {/* Countdown display */}
                <div className="flex flex-col items-center mb-5">
                  <div className="relative w-36 h-36 mb-3">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                      <circle
                        cx="60" cy="60" r="52" fill="none"
                        stroke={timerRemaining !== null && timerRemaining <= 10 ? '#EF4444' : '#10B981'}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 52}`}
                        strokeDashoffset={`${2 * Math.PI * 52 * (1 - timerProgress)}`}
                        className="transition-all duration-300"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-3xl font-mono font-bold ${
                        timerRemaining !== null && timerRemaining <= 10 ? 'text-accent-red' : 'text-text-primary'
                      }`}>
                        {timerRemaining !== null ? formatTime(timerRemaining) : '--:--'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Timer preset buttons */}
                {(timerRemaining === null || timerRemaining === 0) && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {TIMER_PRESETS.map((sec) => (
                        <button
                          key={sec}
                          onClick={() => setCustomDuration(sec)}
                          className={`py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95 cursor-pointer ${
                            customDuration === sec
                              ? 'bg-accent-green/15 text-accent-green ring-1 ring-accent-green/30'
                              : 'bg-white/5 text-text-secondary hover:bg-white/10'
                          }`}
                        >
                          {sec}초
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => startTimer(customDuration)}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-green to-accent-cyan text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform cursor-pointer glow-green"
                    >
                      <Play className="w-4 h-4" /> 타이머 시작 ({customDuration}초)
                    </button>
                  </div>
                )}

                {timerRemaining !== null && timerRemaining > 0 && (
                  <button
                    onClick={stopTimer}
                    className="w-full py-3.5 rounded-xl bg-accent-red/15 text-accent-red font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform cursor-pointer border border-accent-red/20"
                  >
                    <Square className="w-4 h-4" /> 타이머 중지
                  </button>
                )}
              </div>

              {/* Vote count monitor */}
              <VoteMonitor
                voteCount={voteCount}
                totalVoters={totalVoters}
                proCount={proCount}
                conCount={conCount}
                proPercent={proPercent}
                conPercent={conPercent}
                showBreakdown={false}
              />

              {/* Vote reset */}
              <button
                onClick={resetVotes}
                className="w-full py-3 rounded-xl bg-white/5 text-text-secondary font-medium flex items-center justify-center gap-2 active:scale-[0.97] transition-transform cursor-pointer hover:bg-white/10 border border-white/5"
              >
                <RotateCcw className="w-4 h-4" />
                투표 초기화
              </button>
            </motion.section>
          )}

          {/* RESULT Phase: Vote Results + Next Agenda */}
          {currentPhase === 'RESULT' && (
            <motion.section
              key="result"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-3"
            >
              <VoteMonitor
                voteCount={voteCount}
                totalVoters={totalVoters}
                proCount={proCount}
                conCount={conCount}
                proPercent={proPercent}
                conPercent={conPercent}
                showBreakdown={true}
              />

              <AnimatePresence>
                {showNextButton && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 12 }}
                  >
                    {nextAgenda ? (
                      <button
                        onClick={() => selectAgenda(nextAgenda.id)}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-accent-blue to-accent-cyan text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform cursor-pointer glow-blue"
                      >
                        <SkipForward className="w-4 h-4" />
                        다음 안건: {nextAgenda.title}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={openEndMeetingModal}
                        className="w-full py-3.5 rounded-xl bg-accent-red/15 border border-accent-red/25 text-accent-red font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-transform cursor-pointer"
                      >
                        <LogOutIcon className="w-4 h-4" />
                        회의 종료하기
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          )}

          {/* IDLE fallback */}
          {currentPhase === 'IDLE' && currentAgenda && (
            <motion.section
              key="idle-ready"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="glass rounded-2xl p-6 flex flex-col items-center text-center"
            >
              <ListChecks className="w-10 h-10 text-text-muted mb-3" />
              <p className="text-sm text-text-secondary">단계를 선택하여 진행하세요</p>
            </motion.section>
          )}

          {currentPhase === 'IDLE' && !currentAgenda && (
            <motion.section
              key="pre-meeting"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="space-y-4"
            >
              <div className="glass rounded-2xl p-6 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-blue to-accent-cyan flex items-center justify-center">
                  <Users className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary">회의 시작 전</h3>
                  <p className="text-xs text-text-secondary mt-1">참석자가 좌석에 착석하고 있습니다</p>
                </div>
              </div>

              {agendas.length > 0 && (
                <button
                  onClick={() => {
                    const first = agendas[0];
                    if (first) selectAgenda(first.id);
                  }}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-accent-blue to-accent-cyan text-white font-bold text-lg flex items-center justify-center gap-3 active:scale-[0.97] transition-transform cursor-pointer glow-blue"
                >
                  <Play className="w-5 h-5" />
                  회의 시작
                </button>
              )}

              {agendas.length === 0 && (
                <div className="glass rounded-2xl p-4 text-center">
                  <p className="text-sm text-accent-amber">관리자 페이지에서 안건을 먼저 등록해주세요</p>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Inline Questions Section (always visible during meeting) ── */}
        {currentAgendaId && (waitingQuestions.length > 0 || speakingQuestion || doneQuestions.length > 0) && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-accent-amber" />
              <p className="text-sm font-semibold">질문 목록</p>
              <span className="ml-auto text-xs text-text-muted">{waitingQuestions.length}명 대기</span>
            </div>

            {speakingQuestion && (
              <div className="mb-3 p-3 rounded-xl bg-accent-amber/10 border border-accent-amber/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-accent-amber opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-amber" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">{speakingQuestion.profile?.name ?? '알 수 없음'}</p>
                      <p className="text-[10px] text-text-muted">좌석 {speakingQuestion.profile?.assigned_seat}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => finishSpeaker(speakingQuestion)}
                    className="px-3 py-1.5 rounded-lg bg-accent-green/15 text-accent-green text-xs font-medium active:scale-95 transition-transform cursor-pointer"
                  >
                    <span className="flex items-center gap-1"><Check className="w-3 h-3" /> 완료</span>
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {waitingQuestions.map((q, i) => (
                <div key={q.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="w-6 h-6 rounded-full bg-white/10 text-[10px] font-bold flex items-center justify-center text-text-muted shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{q.profile?.name ?? '알 수 없음'}</p>
                      <p className="text-[10px] text-text-muted">좌석 {q.profile?.assigned_seat}</p>
                      {q.memo && <p className="text-[10px] text-accent-cyan mt-0.5 truncate">메모: {q.memo}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => designateSpeaker(q)}
                    disabled={!!speakingQuestion}
                    className="px-3 py-1.5 rounded-lg bg-accent-amber/15 text-accent-amber text-xs font-medium active:scale-95 transition-transform disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed shrink-0 ml-2"
                  >
                    <span className="flex items-center gap-1"><Mic className="w-3 h-3" /> 지명</span>
                  </button>
                </div>
              ))}
            </div>

            {doneQuestions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-[10px] text-text-muted mb-1">완료 ({doneQuestions.length})</p>
                <div className="flex flex-wrap gap-2">
                  {doneQuestions.map((q) => (
                    <span key={q.id} className="inline-flex items-center gap-1 text-[10px] text-text-muted opacity-60">
                      <Check className="w-3 h-3 text-accent-green" />
                      {q.profile?.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        )}
          </>
        )}
      </main>
      )}

      <AnimatePresence>
        {endMeetingModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-meeting-modal-title"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full max-w-lg max-h-[85vh] flex flex-col glass-strong rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <h2 id="end-meeting-modal-title" className="text-lg font-bold text-text-primary">
                  안건별 결과 확인
                </h2>
                <button
                  type="button"
                  onClick={() => setEndMeetingModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/10 text-text-muted cursor-pointer"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
                <p className="text-xs text-text-secondary">
                  아래 결과를 확인한 뒤 &quot;회의 종료 확인&quot;을 누르면 참석자 화면이 감사 인사로 전환됩니다.
                </p>
                {endMeetingModalLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
                  </div>
                ) : endMeetingSummary.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-8">등록된 안건이 없습니다.</p>
                ) : (
                  endMeetingSummary.map((row) => {
                    const pct = (n: number) => (row.total > 0 ? ((n / row.total) * 100).toFixed(1) : '0.0');
                    return (
                      <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
                        <p className="font-semibold text-sm text-text-primary line-clamp-2">{row.title}</p>
                        <div className="flex justify-between text-xs text-text-secondary">
                          <span className="text-accent-blue">찬성 {row.pro}표 ({pct(row.pro)}%)</span>
                          <span className="text-accent-red">반대 {row.con}표 ({pct(row.con)}%)</span>
                        </div>
                        <p className="text-[10px] text-text-muted text-right">총 {row.total}표</p>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-4 border-t border-white/10 flex flex-col sm:flex-row gap-2 shrink-0 bg-bg-primary/80">
                <button
                  type="button"
                  onClick={() => setEndMeetingModalOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 text-text-secondary font-medium cursor-pointer hover:bg-white/10"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void confirmEndMeeting()}
                  disabled={updating}
                  className="flex-1 py-3 rounded-xl bg-accent-red/20 text-accent-red font-semibold border border-accent-red/30 cursor-pointer disabled:opacity-50"
                >
                  회의 종료 확인
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Updating overlay */}
      <AnimatePresence>
        {updating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm pointer-events-none"
          >
            <Loader2 className="w-8 h-8 text-accent-blue animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Vote Monitor Sub-component ─────────────────────────────────────────────
function VoteMonitor({
  voteCount,
  totalVoters,
  proCount,
  conCount,
  proPercent,
  conPercent,
  showBreakdown,
}: {
  voteCount: number;
  totalVoters: number;
  proCount: number;
  conCount: number;
  proPercent: number;
  conPercent: number;
  showBreakdown: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-accent-purple" />
        <p className="text-sm font-semibold">투표 현황</p>
      </div>

      <div className="flex items-end justify-center gap-6 mb-4">
        <div className="text-center">
          <p className="text-3xl font-bold font-mono text-text-primary">{voteCount}</p>
          <p className="text-[10px] text-text-muted">투표 완료</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-mono text-text-muted">/</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold font-mono text-text-muted">{totalVoters}</p>
          <p className="text-[10px] text-text-muted">전체 유권자</p>
        </div>
      </div>

      {/* Participation bar */}
      <div className="w-full h-2 rounded-full bg-white/5 mb-1 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent-blue to-accent-cyan"
          initial={{ width: 0 }}
          animate={{ width: `${totalVoters > 0 ? (voteCount / totalVoters) * 100 : 0}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <p className="text-[10px] text-text-muted text-right mb-4">
        참여율 {totalVoters > 0 ? Math.round((voteCount / totalVoters) * 100) : 0}%
      </p>

      {/* PRO / CON breakdown */}
      {showBreakdown && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-4 border-t border-white/5 space-y-3"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-accent-blue font-medium">찬성</span>
            <span className="font-mono text-text-primary">{proCount}표 ({proPercent}%)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-accent-blue"
              initial={{ width: 0 }}
              animate={{ width: `${proPercent}%` }}
              transition={{ duration: 0.6, delay: 0.1 }}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-accent-red font-medium">반대</span>
            <span className="font-mono text-text-primary">{conCount}표 ({conPercent}%)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-accent-red"
              initial={{ width: 0 }}
              animate={{ width: `${conPercent}%` }}
              transition={{ duration: 0.6, delay: 0.2 }}
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
