"use client";

import { useEffect } from "react";

/**
 * /screen 전용: 루트 rem 기준 150% → Tailwind text-* 유틸이 모두 1.5배로 스케일.
 * 언마운트 시 이전 html font-size 복원.
 */
export default function ScreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.fontSize;
    html.style.fontSize = "150%";
    return () => {
      html.style.fontSize = prev;
    };
  }, []);

  return <>{children}</>;
}
