# SAEROM VOTING

새롬고등학교 대위원회 투표 시스템

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS 4 + Framer Motion
- **Backend/DB**: Supabase (PostgreSQL, Real-time, Auth, Storage)
- **Deployment**: Vercel
- **Auth**: Google OAuth (saerom.hs.kr 전용)

## Pages

| 경로 | 설명 | 접근 |
|------|------|------|
| `/` | 로그인 페이지 | 공개 |
| `/meeting?seat=[seat_no]` | 참석자 뷰 (PDF 캔버스 + 투표/질문) | 참석자 |
| `/screen` | 대형 스크린 뷰 (좌석 맵 + 결과 애니메이션) | 공개 |
| `/remote` | 진행자 리모컨 (단계 제어 + 질문 관리) | 진행자 |
| `/admin` | 관리자 대시보드 (학생/안건/보고서 관리) | 관리자 |

## Setup

### 1. Supabase 프로젝트 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. `supabase-schema.sql`에서 **관리자 이메일을 본인 계정으로 수정** 후 SQL Editor에서 실행
3. Storage에서 `agendas` 버킷 생성 (Public)
4. Authentication → Providers → Google 활성화
   - Authorized redirect URI: `https://your-domain.vercel.app/auth/callback`
   - Google Cloud Console에서 OAuth 2.0 Client ID 설정
   - `hd` 파라미터로 `saerom.hs.kr` 도메인 제한

> **초기 관리자**: `supabase-schema.sql` 실행 시 관리자 프로필이 자동 생성됩니다. 해당 Google 계정으로 처음 로그인하면 auth user와 자동 연결되어 `/admin`으로 이동합니다.

### 2. 환경변수 설정

`.env.local` 파일 생성:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. 개발 서버 실행

```bash
npm install
npm run dev
```

### 4. Vercel 배포

```bash
npx vercel
```

Vercel 대시보드에서 환경변수를 설정합니다.

## Meeting Flow

```
IDLE → INTRO → QA → VOTING → RESULT
```

1. **IDLE**: 대기 상태. 진행자가 안건을 선택합니다.
2. **INTRO**: 안건 소개. 스크린에 안건 제목이 표시됩니다.
3. **QA**: 질의응답. 참석자가 질문을 신청하고, 진행자가 발언자를 지명합니다.
4. **VOTING**: 투표 진행. 참석자가 찬성/반대를 선택합니다. 스크린에 실시간 좌석 맵이 표시됩니다.
5. **RESULT**: 결과 발표. 좌석이 플립 애니메이션으로 찬성/반대를 공개합니다.

## CSV Format

학생 명단 CSV 형식:

```csv
email,name,student_id,role,assigned_seat
student@saerom.hs.kr,홍길동,10101,attendee,1-1
teacher@saerom.hs.kr,김선생,T001,facilitator,
admin@saerom.hs.kr,관리자,A001,admin,
```

## Database Schema

- `profiles`: 사용자 프로필 (이메일, 이름, 학번, 역할, 좌석)
- `agendas`: 안건 목록 (제목, 설명, PDF, 상태)
- `meeting_state`: 회의 상태 (단계, 현재 안건, 타이머, 현재 발언자)
- `votes`: 투표 기록 (안건, 사용자, 찬성/반대)
- `questions`: 질문 신청 (안건, 사용자, 상태)

## Security

- Google OAuth로 `@saerom.hs.kr` 도메인만 허용
- 좌석 번호 URL 파라미터와 프로필의 배정 좌석 매칭 검증
- 1인 1투표 정책 (DB unique constraint + API 검증)
- Supabase RLS(Row Level Security)로 데이터 접근 제어
