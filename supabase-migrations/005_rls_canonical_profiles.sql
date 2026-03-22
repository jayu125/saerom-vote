-- ============================================
-- RLS 정석 정책: 406 에러 방지용
-- ============================================
-- Profiles: id = auth.uid() 기반 즉시 조회 (auth_user_role 의존성 제거)
-- Votes/Questions: WITH CHECK 명시로 RLS 위반 방지

-- 1. 기존 profiles 정책 제거
DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "profiles_staff_read" ON profiles;
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
DROP POLICY IF EXISTS "profiles_anon_read" ON profiles;

-- 2. Profiles 정석 정책 (id 기반)
-- 본인 프로필: id로 즉시 조회 (콜백에서 id 동기화 후)
CREATE POLICY "Profiles: Self Select" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR (auth.jwt()->>'email' IS NOT NULL AND LOWER(email) = LOWER(auth.jwt()->>'email')));

CREATE POLICY "Profiles: Self Update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Profiles: Admin All" ON profiles
  FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) = 'admin');

-- 3. Facilitator/Screen용 (기존 기능 유지)
CREATE POLICY "Profiles: Staff Read" ON profiles
  FOR SELECT TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1) IN ('admin', 'facilitator'));

CREATE POLICY "Profiles: Anon Read" ON profiles
  FOR SELECT TO anon
  USING (true);

-- 4. Votes/Questions INSERT WITH CHECK 확인 (이미 있으면 재생성)
DROP POLICY IF EXISTS "votes_insert_self" ON votes;
CREATE POLICY "Votes: Self Insert" ON votes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "questions_insert_self" ON questions;
CREATE POLICY "Questions: Self Insert" ON questions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 5. Replica Identity (Realtime용)
ALTER TABLE meeting_state REPLICA IDENTITY FULL;
ALTER TABLE registration_requests REPLICA IDENTITY FULL;
