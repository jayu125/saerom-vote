-- ============================================
-- RLS auth 함수 수정: 관리자 로그인 시 "승인 대기중" 문제 해결
-- ============================================
-- 원인: auth_user_role()이 email로만 조회해 JWT 구조에 따라 실패하거나,
--      profiles_self_read에서 id/email 매칭이 실패할 수 있음

-- 1. auth_user_email() 보강: JWT 내 이메일 위치 다양하게 시도
CREATE OR REPLACE FUNCTION auth_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT TRIM(COALESCE(
    auth.jwt()->>'email',
    auth.jwt()->'user_metadata'->>'email'
  ));
$$;

-- 2. auth_user_role() 보강: id( auth.uid() ) 또는 email로 조회
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles
  WHERE id = auth.uid()
     OR (auth_user_email() IS NOT NULL AND LOWER(email) = LOWER(auth_user_email()))
  LIMIT 1;
$$;

-- 3. profiles_self_read 정책: 대소문자 무시 비교 추가
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (auth_user_email() IS NOT NULL AND LOWER(email) = LOWER(auth_user_email()))
  );
