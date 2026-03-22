-- 회의 종료 상태: 참석자 감사 페이지로 유도
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'meeting_phase' AND e.enumlabel = 'ENDED'
  ) THEN
    ALTER TYPE meeting_phase ADD VALUE 'ENDED';
  END IF;
END $$;

COMMENT ON TYPE meeting_phase IS 'IDLE, INTRO, QA, VOTING, RESULT, ENDED(회의 종료·참석자 퇴장 유도)';
