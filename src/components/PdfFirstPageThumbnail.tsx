'use client';

import { useEffect, useRef, useState } from 'react';
import { initPdfWorker } from '@/lib/pdf-utils';
import { FileText, Loader2 } from 'lucide-react';

type Props = {
  pdfUrl: string | null | undefined;
  maxWidth?: number;
  className?: string;
};

/**
 * PDF 첫 페이지를 작은 썸네일로 렌더 (보고서 안건 식별용)
 */
export function PdfFirstPageThumbnail({ pdfUrl, maxWidth = 140, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!pdfUrl) {
      setErr(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(false);
      try {
        const pdfjsLib = await initPdfWorker();
        if (!pdfjsLib) throw new Error('pdf');
        const res = await fetch(pdfUrl);
        if (!res.ok) throw new Error(`http ${res.status}`);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        const page = await pdf.getPage(1);
        const raw = page.getViewport({ scale: 1 });
        const scale = maxWidth / raw.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) {
          pdf.destroy();
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          pdf.destroy();
          return;
        }
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        pdf.destroy();
      } catch {
        if (!cancelled) setErr(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, maxWidth]);

  if (!pdfUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-text-muted ${className}`}
        style={{ width: maxWidth, minHeight: 100 }}
      >
        <FileText className="w-8 h-8 opacity-40" />
      </div>
    );
  }

  if (err) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-xs text-text-muted px-2 text-center ${className}`}
        style={{ width: maxWidth, minHeight: 100 }}
      >
        미리보기 불가
      </div>
    );
  }

  return (
    <div className={`relative inline-flex flex-col items-center ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-bg-primary/80 z-10">
          <Loader2 className="w-6 h-6 text-accent-blue animate-spin" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="rounded-xl border border-white/10 shadow-lg shadow-black/20"
        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  );
}
