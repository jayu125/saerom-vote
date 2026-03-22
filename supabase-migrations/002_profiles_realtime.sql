-- profiles 테이블 Realtime 활성화 (가입 승인 시 홈에서 실시간 반영)
-- registration_requests UPDATE 이벤트 수신을 위한 REPLICA IDENTITY
-- 기존 프로젝트에 Supabase SQL Editor에서 실행하세요.

ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER TABLE registration_requests REPLICA IDENTITY FULL;
