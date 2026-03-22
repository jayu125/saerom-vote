export type Role = 'admin' | 'facilitator' | 'attendee';
export type Phase = 'IDLE' | 'INTRO' | 'QA' | 'VOTING' | 'RESULT' | 'ENDED';
export type VoteChoice = 'PRO' | 'CON';
export type AgendaStatus = 'pending' | 'active' | 'completed';
export type QuestionStatus = 'waiting' | 'speaking' | 'done';
export type RequestStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  name: string;
  student_id: string;
  role: Role;
  assigned_seat: string;
}

export interface Agenda {
  id: string;
  title: string;
  description: string;
  pdf_url: string | null;
  status: AgendaStatus;
  order_index: number;
  created_at: string;
}

export interface SeatLayout {
  rows: number;
  sections: number[];
}

export const DEFAULT_SEAT_LAYOUT: SeatLayout = { rows: 7, sections: [6, 6, 6] };

export interface MeetingState {
  id: string;
  phase: Phase;
  current_agenda_id: string | null;
  timer_end_at: string | null;
  current_speaker_id: string | null;
  seat_layout?: SeatLayout | null;
}

export interface Vote {
  id: string;
  agenda_id: string;
  user_id: string;
  choice: VoteChoice;
  con_reason?: string | null;
  created_at: string;
}

export interface Question {
  id: string;
  agenda_id: string;
  user_id: string;
  memo: string;
  status: QuestionStatus;
  created_at: string;
  profile?: Profile;
}

export interface RegistrationRequest {
  id: string;
  email: string;
  name: string;
  status: RequestStatus;
  created_at: string;
}

export interface VoteResult {
  agenda_id: string;
  pro_count: number;
  con_count: number;
  total_count: number;
}

export interface SeatVoteInfo {
  seat: string;
  name: string;
  voted: boolean;
  choice?: VoteChoice;
  online?: boolean;
  userId?: string;
  email?: string;
  student_id?: string;
}
