'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Profile, Vote as VoteType, VoteChoice, SeatLayout } from '@/lib/types';
import { DEFAULT_SEAT_LAYOUT } from '@/lib/types';
import { X } from 'lucide-react';

export function seatId(row: number, col: number): string {
  return `${row}-${col}`;
}

interface CellInfo {
  id: string;
  row: number;
  col: number;
  profile?: Profile;
  online: boolean;
  voted: boolean;
  choice?: VoteChoice;
}

interface SeatGridProps {
  layout?: SeatLayout;
  profiles: Profile[];
  presenceSet: Set<string>;
  votes?: VoteType[];
  interactive?: boolean;
  cellSize?: number;
  hideEmpty?: boolean;
  /** Light surfaces (e.g. projection /screen); default matches dark app shell */
  appearance?: 'dark' | 'light';
}

export default function SeatGrid({
  layout = DEFAULT_SEAT_LAYOUT,
  profiles,
  presenceSet,
  votes = [],
  interactive = false,
  cellSize = 48,
  hideEmpty = false,
  appearance = 'dark',
}: SeatGridProps) {
  const [selected, setSelected] = useState<CellInfo | null>(null);

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();
    profiles.forEach((p) => {
      if (p.assigned_seat) map.set(p.assigned_seat, p);
    });
    return map;
  }, [profiles]);

  const voteMap = useMemo(() => {
    const map = new Map<string, VoteType>();
    votes.forEach((v) => map.set(v.user_id, v));
    return map;
  }, [votes]);

  const totalCols = layout.sections.reduce((a, b) => a + b, 0);

  const grid = useMemo(() => {
    const rows: CellInfo[][] = [];
    for (let r = 1; r <= layout.rows; r++) {
      const row: CellInfo[] = [];
      for (let c = 1; c <= totalCols; c++) {
        const id = seatId(r, c);
        const profile = profileMap.get(id);
        const vote = profile ? voteMap.get(profile.id) : undefined;
        row.push({
          id,
          row: r,
          col: c,
          profile,
          online: profile ? presenceSet.has(profile.id) : false,
          voted: !!vote,
          choice: vote?.choice,
        });
      }
      rows.push(row);
    }
    return rows;
  }, [layout.rows, totalCols, profileMap, voteMap, presenceSet]);

  return (
    <div className="relative inline-block">
      <div className="flex flex-col gap-1.5">
        {grid.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center justify-center">
            {layout.sections.map((sectionSize, sIdx) => {
              const startCol = layout.sections.slice(0, sIdx).reduce((a, b) => a + b, 0);
              const cells = row.slice(startCol, startCol + sectionSize);
              return (
                <div key={sIdx} className={`flex gap-1.5 ${sIdx > 0 ? 'ml-5' : ''}`}>
                  {cells.map((cell) => {
                    const isEmpty = !cell.profile;
                    const isOnline = cell.online;

                    if (hideEmpty && isEmpty) {
                      return (
                        <div
                          key={cell.id}
                          style={{ width: cellSize, height: cellSize }}
                        />
                      );
                    }

                    let bg =
                      appearance === 'light'
                        ? 'bg-slate-200 border border-slate-300'
                        : 'bg-white/[0.03] border border-white/[0.06]';
                    let text =
                      appearance === 'light' ? 'text-slate-500' : 'text-text-muted/30';

                    if (cell.profile) {
                      if (cell.voted) {
                        if (cell.choice) {
                          if (appearance === 'light') {
                            bg =
                              cell.choice === 'PRO'
                                ? 'bg-emerald-100 border border-emerald-300'
                                : 'bg-red-100 border border-red-300';
                            text =
                              cell.choice === 'PRO' ? 'text-emerald-700' : 'text-red-700';
                          } else {
                            bg =
                              cell.choice === 'PRO'
                                ? 'bg-accent-green/20 border border-accent-green/30'
                                : 'bg-accent-red/20 border border-accent-red/30';
                            text =
                              cell.choice === 'PRO' ? 'text-accent-green' : 'text-accent-red';
                          }
                        } else if (appearance === 'light') {
                          bg = 'bg-sky-100 border border-sky-300';
                          text = 'text-slate-900';
                        } else {
                          bg = 'bg-accent-blue/25 border border-accent-blue/30';
                          text = 'text-accent-blue';
                        }
                      } else if (isOnline) {
                        if (appearance === 'light') {
                          bg = 'bg-sky-50 border border-sky-200';
                          text = 'text-slate-900';
                        } else {
                          bg = 'bg-accent-blue/15 border border-accent-blue/25';
                          text = 'text-accent-blue';
                        }
                      } else if (appearance === 'light') {
                        bg = 'bg-white border border-slate-200 shadow-sm';
                        text = 'text-slate-700';
                      } else {
                        bg = 'bg-white/[0.06] border border-white/[0.08]';
                        text = 'text-text-muted/60';
                      }
                    }

                    const glow =
                      isOnline && !cell.voted
                        ? {
                            boxShadow:
                              appearance === 'light'
                                ? '0 2px 10px rgba(14,165,233,0.18)'
                                : '0 0 8px rgba(59,130,246,0.5), 0 0 20px rgba(59,130,246,0.2)',
                          }
                        : {};

                    return (
                      <motion.div
                        key={cell.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: rowIdx * 0.03 + (cell.col - startCol - 1) * 0.008, duration: 0.25 }}
                        style={{ width: cellSize, height: cellSize, ...glow }}
                        className={`rounded-lg flex items-center justify-center text-[0.625rem] font-bold select-none transition-all duration-500 ${bg} ${text} ${
                          interactive && cell.profile
                            ? appearance === 'light'
                              ? 'cursor-pointer hover:ring-1 hover:ring-blue-400/50'
                              : 'cursor-pointer hover:ring-1 hover:ring-accent-blue/40'
                            : ''
                        }`}
                        onClick={() => {
                          if (interactive && cell.profile) setSelected(cell);
                        }}
                      >
                        {cell.id}
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selected && interactive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass-strong rounded-2xl p-5 w-60 z-50 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold gradient-text">좌석 {selected.id}</span>
              <button
                onClick={() => setSelected(null)}
                className={`p-1 rounded-lg cursor-pointer ${appearance === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <div className="space-y-1.5 text-sm">
              <p><span className="text-text-muted">이름:</span> {selected.profile?.name}</p>
              {selected.profile?.student_id && (
                <p><span className="text-text-muted">학번:</span> {selected.profile.student_id}</p>
              )}
              <p><span className="text-text-muted">이메일:</span> {selected.profile?.email}</p>
              <p>
                <span className="text-text-muted">접속:</span>{' '}
                <span className={selected.online ? 'text-accent-green' : 'text-accent-red'}>
                  {selected.online ? '온라인' : '오프라인'}
                </span>
              </p>
              {selected.voted && (
                <p>
                  <span className="text-text-muted">투표:</span>{' '}
                  <span className={selected.choice === 'PRO' ? 'text-accent-green' : 'text-accent-red'}>
                    {selected.choice === 'PRO' ? '찬성' : '반대'}
                  </span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {selected && interactive && (
        <div className="fixed inset-0 z-40" onClick={() => setSelected(null)} />
      )}
    </div>
  );
}
