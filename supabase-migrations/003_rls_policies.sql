-- ============================================
-- RLS 정책 적용: DB 보안 강화
-- ============================================
-- supabase-schema.sql에서 DISABLE RLS를 제거한 뒤 이 마이그레이션을 실행하세요.
-- auth_user_role(), auth_user_email() 함수는 스키마에 이미 정의되어 있어야 합니다.

-- 1. 모든 테이블 RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 제거 (있을 경우)
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "profiles_staff_read" ON profiles;
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
DROP POLICY IF EXISTS "profiles_anon_read" ON profiles;
DROP POLICY IF EXISTS "registration_requests_admin_all" ON registration_requests;
DROP POLICY IF EXISTS "registration_requests_self_read" ON registration_requests;
DROP POLICY IF EXISTS "agendas_read_authenticated" ON agendas;
DROP POLICY IF EXISTS "agendas_read_anon" ON agendas;
DROP POLICY IF EXISTS "agendas_admin_all" ON agendas;
DROP POLICY IF EXISTS "meeting_state_read_all" ON meeting_state;
DROP POLICY IF EXISTS "meeting_state_read_anon" ON meeting_state;
DROP POLICY IF EXISTS "meeting_state_update_staff" ON meeting_state;
DROP POLICY IF EXISTS "votes_insert_self" ON votes;
DROP POLICY IF EXISTS "votes_read_staff" ON votes;
DROP POLICY IF EXISTS "votes_read_anon" ON votes;
DROP POLICY IF EXISTS "questions_insert_self" ON questions;
DROP POLICY IF EXISTS "questions_read_all" ON questions;
DROP POLICY IF EXISTS "questions_update_staff" ON questions;

-- 3. profiles 정책
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (auth_user_role() = 'admin');

-- 관리자/진행자: 전체 조회 (좌석맵 등)
CREATE POLICY "profiles_staff_read" ON profiles
  FOR SELECT TO authenticated
  USING (auth_user_role() IN ('admin', 'facilitator'));

-- 일반 참가자: 본인 프로필만 조회
CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR email = auth_user_email());

-- Screen(anon)에서 좌석 그리드 표시용
CREATE POLICY "profiles_anon_read" ON profiles
  FOR SELECT TO anon
  USING (true);

-- 4. registration_requests 정책
CREATE POLICY "registration_requests_admin_all" ON registration_requests
  FOR ALL TO authenticated
  USING (auth_user_role() = 'admin');

CREATE POLICY "registration_requests_self_read" ON registration_requests
  FOR SELECT TO authenticated
  USING (email = auth_user_email());

-- 5. agendas 정책
CREATE POLICY "agendas_read_authenticated" ON agendas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "agendas_read_anon" ON agendas
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "agendas_admin_all" ON agendas
  FOR ALL TO authenticated
  USING (auth_user_role() = 'admin');

-- 6. meeting_state 정책
CREATE POLICY "meeting_state_read_all" ON meeting_state
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "meeting_state_read_anon" ON meeting_state
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "meeting_state_update_staff" ON meeting_state
  FOR UPDATE TO authenticated
  USING (auth_user_role() IN ('admin', 'facilitator'));

-- meeting_state INSERT는 초기 설정 시에만 필요 (서비스 역할 사용)
-- meeting_state는 singleton이므로 일반 사용자 INSERT 불필요

-- 7. votes 정책
CREATE POLICY "votes_insert_self" ON votes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "votes_read_staff" ON votes
  FOR SELECT TO authenticated
  USING (auth_user_role() IN ('admin', 'facilitator'));

CREATE POLICY "votes_read_anon" ON votes
  FOR SELECT TO anon
  USING (true);

-- 8. questions 정책
CREATE POLICY "questions_insert_self" ON questions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "questions_read_all" ON questions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "questions_read_anon" ON questions
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "questions_update_staff" ON questions
  FOR UPDATE TO authenticated
  USING (auth_user_role() IN ('admin', 'facilitator'));
