'use client';

import { create } from 'zustand';
import type { MeetingState, Profile, Agenda, Question, SeatVoteInfo } from './types';

interface AppState {
  profile: Profile | null;
  meetingState: MeetingState | null;
  agendas: Agenda[];
  currentAgenda: Agenda | null;
  questions: Question[];
  seatVotes: SeatVoteInfo[];
  hasVoted: boolean;
  hasAskedQuestion: boolean;

  setProfile: (profile: Profile | null) => void;
  setMeetingState: (state: MeetingState) => void;
  setAgendas: (agendas: Agenda[]) => void;
  setCurrentAgenda: (agenda: Agenda | null) => void;
  setQuestions: (questions: Question[]) => void;
  setSeatVotes: (seatVotes: SeatVoteInfo[]) => void;
  setHasVoted: (hasVoted: boolean) => void;
  setHasAskedQuestion: (hasAsked: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  meetingState: null,
  agendas: [],
  currentAgenda: null,
  questions: [],
  seatVotes: [],
  hasVoted: false,
  hasAskedQuestion: false,

  setProfile: (profile) => set({ profile }),
  setMeetingState: (meetingState) => set({ meetingState }),
  setAgendas: (agendas) => set({ agendas }),
  setCurrentAgenda: (currentAgenda) => set({ currentAgenda }),
  setQuestions: (questions) => set({ questions }),
  setSeatVotes: (seatVotes) => set({ seatVotes }),
  setHasVoted: (hasVoted) => set({ hasVoted }),
  setHasAskedQuestion: (hasAskedQuestion) => set({ hasAskedQuestion }),
}));
