import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json() as {
      agenda_id?: string;
      choice?: string;
      con_reason?: string | null;
    };
    const { agenda_id, choice, con_reason } = body;

    if (!agenda_id || !choice || !['PRO', 'CON'].includes(choice)) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    if (choice === 'CON') {
      const reason = typeof con_reason === 'string' ? con_reason.trim() : '';
      if (reason.length === 0) {
        return NextResponse.json({ error: '반대 시 사유를 입력해 주세요.' }, { status: 400 });
      }
    }

    const { data: meetingState } = await supabase
      .from('meeting_state')
      .select('phase, current_agenda_id, timer_end_at')
      .single();

    if (!meetingState || meetingState.phase !== 'VOTING' || meetingState.current_agenda_id !== agenda_id) {
      return NextResponse.json({ error: '현재 투표가 진행 중이 아닙니다.' }, { status: 403 });
    }

    if (!meetingState.timer_end_at || Date.now() > new Date(meetingState.timer_end_at).getTime()) {
      return NextResponse.json({ error: '투표 시간이 아닙니다.' }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from('votes')
      .select('id')
      .eq('agenda_id', agenda_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '이미 투표하셨습니다.' }, { status: 409 });
    }

    const reasonTrimmed =
      choice === 'CON' && typeof con_reason === 'string' ? con_reason.trim() : '';

    // 찬성(PRO)은 con_reason 키를 보내지 않음 → DB에 컬럼이 없어도 찬성 투표 가능
    // 반대(CON)만 con_reason 포함 → 컬럼 추가 마이그레이션 필요
    const insertRow =
      choice === 'CON'
        ? {
            agenda_id,
            user_id: user.id,
            choice,
            con_reason: reasonTrimmed,
          }
        : {
            agenda_id,
            user_id: user.id,
            choice,
          };

    const { error } = await supabase.from('votes').insert(insertRow);

    if (error) {
      const msg = error.message ?? '';
      const needsMigration =
        choice === 'CON' &&
        (msg.includes('con_reason') || msg.includes('schema cache'));
      return NextResponse.json(
        {
          error: needsMigration
            ? 'DB에 votes.con_reason 컬럼이 없습니다. Supabase SQL Editor에서 실행: ALTER TABLE votes ADD COLUMN IF NOT EXISTS con_reason TEXT;'
            : msg,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
