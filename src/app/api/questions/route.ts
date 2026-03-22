import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { agenda_id, memo } = await request.json();

    if (!agenda_id) {
      return NextResponse.json({ error: '안건 ID가 필요합니다.' }, { status: 400 });
    }

    const { data: meetingState } = await supabase
      .from('meeting_state')
      .select('phase, current_agenda_id')
      .single();

    const allowedPhases = ['IDLE', 'INTRO', 'QA'];
    if (!meetingState || !allowedPhases.includes(meetingState.phase) || meetingState.current_agenda_id !== agenda_id) {
      return NextResponse.json({ error: '현재 질문을 신청할 수 없는 단계입니다.' }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from('questions')
      .select('id')
      .eq('agenda_id', agenda_id)
      .eq('user_id', user.id)
      .in('status', ['waiting', 'speaking'])
      .single();

    if (existing) {
      return NextResponse.json({ error: '이미 질문을 신청하셨습니다.' }, { status: 409 });
    }

    const { error } = await supabase.from('questions').insert({
      agenda_id,
      user_id: user.id,
      memo: memo || '',
      status: 'waiting',
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
