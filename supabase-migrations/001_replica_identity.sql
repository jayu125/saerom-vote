-- meeting_state UPDATE 이벤트 시 payload.new에 전체 행이 포함되도록 REPLICA IDENTITY FULL 설정
-- Supabase Realtime postgres_changes가 UPDATE 이벤트를 안정적으로 전달하려면 이 설정이 필요할 수 있습니다.
-- 기존 프로젝트에 이미 meeting_state 테이블이 있다면 이 파일만 Supabase SQL Editor에서 실행하세요.

ALTER TABLE meeting_state REPLICA IDENTITY FULL;
