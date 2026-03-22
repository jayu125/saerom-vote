-- ============================================
-- 대위원회 투표 시스템 - Supabase Schema
-- ============================================
-- ⚠️ 이 스크립트는 기존 테이블을 삭제하고 재생성합니다.
-- 반드시 이메일 부분(하단)을 수정한 후 실행하세요.

-- 기존 테이블 삭제 (의존 순서 고려)
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS votes CASCADE;
DROP TABLE IF EXISTS meeting_state CASCADE;
DROP TABLE IF EXISTS agendas CASCADE;
DROP TABLE IF EXISTS registration_requests CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- 기존 ENUM 타입 삭제
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS meeting_phase CASCADE;
DROP TYPE IF EXISTS agenda_status CASCADE;
DROP TYPE IF EXISTS vote_choice CASCADE;
DROP TYPE IF EXISTS question_status CASCADE;
DROP TYPE IF EXISTS request_status CASCADE;

-- 기존 함수 삭제
DROP FUNCTION IF EXISTS auth_user_role();
DROP FUNCTION IF EXISTS auth_user_email();
DROP FUNCTION IF EXISTS get_vote_results(UUID);

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'facilitator', 'attendee');
CREATE TYPE meeting_phase AS ENUM ('IDLE', 'INTRO', 'QA', 'VOTING', 'RESULT', 'ENDED');
CREATE TYPE agenda_status AS ENUM ('pending', 'active', 'completed');
CREATE TYPE vote_choice AS ENUM ('PRO', 'CON');
CREATE TYPE question_status AS ENUM ('waiting', 'speaking', 'done');
CREATE TYPE request_status AS ENUM ('pending', 'approved', 'rejected');

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  student_id TEXT,
  role user_role DEFAULT 'attendee',
  assigned_seat TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- REGISTRATION REQUESTS (가입 승인 요청)
-- ============================================
CREATE TABLE registration_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status request_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AGENDAS
-- ============================================
CREATE TABLE agendas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  pdf_url TEXT,
  status agenda_status DEFAULT 'pending',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MEETING STATE (singleton row)
-- ============================================
CREATE TABLE meeting_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phase meeting_phase DEFAULT 'IDLE',
  current_agenda_id UUID REFERENCES agendas(id) ON DELETE SET NULL,
  timer_end_at TIMESTAMPTZ,
  current_speaker_id UUID,
  seat_layout JSONB DEFAULT '{"rows": 7, "sections": [6, 6, 6]}'::jsonb
);

INSERT INTO meeting_state (phase) VALUES ('IDLE');

-- ============================================
-- VOTES
-- ============================================
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agenda_id UUID NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  choice vote_choice NOT NULL,
  con_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agenda_id, user_id)
);

-- ============================================
-- QUESTIONS
-- ============================================
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agenda_id UUID NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  memo TEXT DEFAULT '',
  status question_status DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HELPER FUNCTIONS (테이블 생성 후)
-- ============================================
CREATE OR REPLACE FUNCTION auth_user_email()
RETURNS TEXT AS $$
  SELECT COALESCE(
    auth.jwt()->>'email',
    (auth.jwt()->'user_metadata'->>'email')
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles
  WHERE email = auth_user_email()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_vote_results(p_agenda_id UUID)
RETURNS JSON AS $$
  SELECT json_build_object(
    'agenda_id', p_agenda_id,
    'pro_count', COUNT(*) FILTER (WHERE choice = 'PRO'),
    'con_count', COUNT(*) FILTER (WHERE choice = 'CON'),
    'total_count', COUNT(*)
  )
  FROM votes
  WHERE agenda_id = p_agenda_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- RLS 활성화 및 정책
-- ============================================
-- supabase-migrations/003_rls_policies.sql 실행 후 RLS 정책이 적용됩니다.
-- 초기 스키마만 실행한 경우 RLS는 비활성 상태이므로 003을 반드시 실행하세요.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STORAGE: agendas 버킷 + 정책
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('agendas', 'agendas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "agendas_insert" ON storage.objects;
DROP POLICY IF EXISTS "agendas_select" ON storage.objects;
DROP POLICY IF EXISTS "agendas_update" ON storage.objects;
DROP POLICY IF EXISTS "agendas_delete" ON storage.objects;

CREATE POLICY "agendas_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'agendas');
CREATE POLICY "agendas_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'agendas');
CREATE POLICY "agendas_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'agendas');
CREATE POLICY "agendas_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'agendas');
ㄱ
-- ============================================
-- REPLICA IDENTITY (Realtime UPDATE 이벤트 수신 필수)
-- ============================================
-- postgres_changes UPDATE 이벤트에서 payload.new 전체 행 수신을 위해 필요.
ALTER TABLE meeting_state REPLICA IDENTITY FULL;
ALTER TABLE registration_requests REPLICA IDENTITY FULL;

-- ============================================
-- REALTIME PUBLICATION
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE meeting_state;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE agendas;
ALTER PUBLICATION supabase_realtime ADD TABLE registration_requests;

-- ============================================
-- INITIAL ADMIN SETUP
-- ============================================
-- ⚠️ 아래 이메일을 실제 관리자 Google 계정으로 변경하세요!
INSERT INTO profiles (email, name, student_id, role, assigned_seat)
VALUES ('admin@saerom.hs.kr', '관리자', 'ADMIN', 'admin', '')
ON CONFLICT (email) DO NOTHING;
