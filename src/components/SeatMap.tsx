'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Vote as VoteType, VoteChoice, Phase } from '@/lib/types';
import { X, ThumbsUp, ThumbsDown } from 'lucide-react';

function parseSeat(seat: string): { row: number; col: number } {
  const parts = seat.split('-');
  if (parts.length === 2) {
    return { row: parseInt(parts[0], 10) || 0, col: parseInt(parts[1], 10) || 0 };
  }
  const match = seat.match(/^([A-Za-z]+)(\d+)$/);
  if (match) {
    const rowStr = match[1].toUpperCase();
    let row = 0;
    for (let i = 0; i < rowStr.length; i++) row = row * 26 + (rowStr.charCodeAt(i) - 64);
    return { row, col: parseInt(match[2], 10) || 0 };
  }
  return { row: 0, col: parseInt(seat, 10) || 0 };
}

export interface SeatInfo {
  seat: string;
  name: string;
  email?: string;
  student_id?: string;
  voted: boolean;
  choice?: VoteChoice;
  online: boolean;
}

interface SeatMapProps {
  profiles: Profile[];
  votes: VoteType[];
  phase: Phase;
  presenceSet: Set<string>;
  interactive?: boolean;
  showEmpty?: boolean;
  cellSize?: number;
}

export default function SeatMap({
  profiles,
  votes,
  phase,
  presenceSet,
  interactive = false,
  showEmpty = false,
  cellSize = 54,
}: SeatMapProps) {
  const [selected, setSelected] = useState<SeatInfo | null>(null);

  const { seats, cols } = useMemo(() => {
    const filtered = profiles.filter((p) => p.assigned_seat);
    const sorted = [...filtered].sort((a, b) => {
      const pa = parseSeat(a.assigned_seat);
      const pb = parseSeat(b.assigned_seat);
      return pa.row !== pb.row ? pa.row - pb.row : pa.col - pb.col;
    });

    let maxCol = 6;
    sorted.forEach((p) => {
      const s = parseSeat(p.assigned_seat);
      if (s.col > maxCol) maxCol = s.col;
    });

    const seatList: SeatInfo[] = sorted.map((p) => {
      const vote = votes.find((v) => v.user_id === p.id);
      return {
        seat: p.assigned_seat,
        name: p.name,
        email: p.email,
        student_id: p.student_id,
        voted: !!vote,
        choice: vote?.choice,
        online: presenceSet.has(p.id),
      };
    });

    return { seats: seatList, cols: Math.min(maxCol, 12) };
  }, [profiles, votes, presenceSet]);

  const isRevealPhase = phase === 'RESULT';
  const isVotingPhase = phase === 'VOTING';

  return (
    <div className="relative">
      <div
        className="grid gap-2 justify-center"
        style={{ gridTemplateColumns: `repeat(${cols}, ${cellSize}px)` }}
      >
        {seats.map((info, i) => {
          const isOnline = info.online;
          const baseClasses = `w-full aspect-square rounded-lg flex items-center justify-center text-[11px] font-bold transition-all duration-300`;

          let bgColor = 'bg-white/[0.06] text-text-muted';
          if (isRevealPhase && info.voted) {
            bgColor = info.choice === 'PRO'
              ? 'bg-accent-blue/30 text-accent-blue'
              : 'bg-accent-red/30 text-accent-red';
          } else if (isVotingPhase && info.voted) {
            bgColor = 'bg-accent-green/20 text-accent-green';
          } else if (isOnline) {
            bgColor = 'bg-accent-blue/10 text-accent-blue';
          }

          const glowStyle = isOnline && !isRevealPhase
            ? { boxShadow: '0 0 8px rgba(59,130,246,0.4), 0 0 20px rgba(59,130,246,0.15)' }
            : {};

          if (!showEmpty && phase !== 'IDLE' && !isOnline && !info.voted) {
            return (
              <div
                key={info.seat}
                className={`w-full aspect-square rounded-lg opacity-20 bg-white/[0.03]`}
                style={{ width: cellSize }}
              />
            );
          }

          return (
            <motion.div
              key={info.seat}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.01, duration: 0.3 }}
              className={`${baseClasses} ${bgColor} ${interactive ? 'cursor-pointer hover:ring-1 hover:ring-accent-blue/40' : ''}`}
              style={{ width: cellSize, ...glowStyle }}
              onClick={() => interactive && setSelected(info)}
            >
              {isRevealPhase && info.voted
                ? (info.choice === 'PRO' ? '찬' : '반')
                : info.seat
              }
            </motion.div>
          );
        })}
      </div>

      {/* Tooltip / popup for interactive mode */}
      <AnimatePresence>
        {selected && interactive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-strong rounded-2xl p-5 w-64 z-50 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold gradient-text">좌석 {selected.seat}</h4>
              <button
                onClick={() => setSelected(null)}
                className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <div className="space-y-1 text-sm">
              <p><span className="text-text-muted">이름:</span> {selected.name}</p>
              {selected.student_id && (
                <p><span className="text-text-muted">학번:</span> {selected.student_id}</p>
              )}
              <p>
                <span className="text-text-muted">접속:</span>{' '}
                <span className={selected.online ? 'text-accent-green' : 'text-accent-red'}>
                  {selected.online ? '온라인' : '오프라인'}
                </span>
              </p>
              {(isVotingPhase || isRevealPhase) && (
                <p>
                  <span className="text-text-muted">투표:</span>{' '}
                  {selected.voted ? (
                    <span className="inline-flex items-center gap-1">
                      {selected.choice === 'PRO'
                        ? <><ThumbsUp className="w-3 h-3 text-accent-blue" /> 찬성</>
                        : <><ThumbsDown className="w-3 h-3 text-accent-red" /> 반대</>
                      }
                    </span>
                  ) : (
                    <span className="text-text-muted">미투표</span>
                  )}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Presence hook: tracks which users are online, respects page visibility
export function usePresence(channelName: string, userId?: string) {
  const supabase = useMemo(() => createClient(), []);
  const [presenceSet, setPresenceSet] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase.channel(channelName, { config: { presence: { key: userId || 'anon' } } });
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        for (const key of Object.keys(state)) {
          ids.add(key);
        }
        setPresenceSet(ids);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && userId) {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    // Track page visibility — untrack when user leaves the tab, re-track when they return
    const handleVisibility = async () => {
      if (!userId || !channelRef.current) return;
      try {
        if (document.hidden) {
          await channelRef.current.untrack();
        } else {
          await channelRef.current.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      } catch { /* channel may already be removed */ }
    };

    if (userId && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
      supabase.removeChannel(channel);
    };
  }, [supabase, channelName, userId]);

  return presenceSet;
}
