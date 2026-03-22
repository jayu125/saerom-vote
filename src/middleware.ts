// middleware.ts
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // 1. /screen 으로 시작하는 경로는 세션 체크 없이 즉시 통과
  if (request.nextUrl.pathname.startsWith("/screen")) {
    return NextResponse.next();
  }

  // 2. 그 외의 경로는 기존 세션 업데이트 로직 수행
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
