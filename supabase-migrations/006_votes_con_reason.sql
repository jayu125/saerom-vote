-- 반대 투표 시 사유 저장
ALTER TABLE votes ADD COLUMN IF NOT EXISTS con_reason TEXT;

COMMENT ON COLUMN votes.con_reason IS 'choice가 CON일 때만 필수로 저장되는 반대 사유';
