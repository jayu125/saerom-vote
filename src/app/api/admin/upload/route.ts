import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, requireAdmin } from '@/lib/supabase/server';

interface ProfileRow {
  email: string;
  name: string;
  student_id: string;
  role: string;
  assigned_seat: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { profiles } = (await request.json()) as { profiles: ProfileRow[] };

    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
      return NextResponse.json(
        { error: '유효한 프로필 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    const supabase = await createServiceClient();

    const validRoles = ['admin', 'facilitator', 'attendee'];
    const cleaned = profiles.map((p) => ({
      email: p.email?.trim(),
      name: p.name?.trim(),
      student_id: p.student_id?.trim(),
      role: validRoles.includes(p.role?.trim()) ? p.role.trim() : 'attendee',
      assigned_seat: p.assigned_seat?.trim() || '',
    }));

    const invalid = cleaned.filter((p) => !p.email || !p.name || !p.student_id);
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `${invalid.length}개의 행에 필수 필드(email, name, student_id)가 누락되었습니다.` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('profiles')
      .upsert(cleaned, { onConflict: 'email', ignoreDuplicates: false })
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `${data?.length ?? 0}명의 학생이 등록되었습니다.`,
      count: data?.length ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
