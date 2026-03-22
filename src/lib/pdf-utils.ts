/**
 * PDF.js 로컬 워커 초기화
 * public/workers/pdf.worker.min.mjs 사용 → CDN 불안정성 제거
 */
export async function initPdfWorker() {
  if (typeof window === 'undefined') return null;

  if (typeof window.crypto !== 'undefined' && !window.crypto.randomUUID) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.crypto as any).randomUUID = () =>
      `${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`;
  }

  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/workers/pdf.worker.min.mjs';
    return pdfjsLib;
  } catch (err) {
    console.error('PDF Worker 초기화 실패:', err);
    return null;
  }
}