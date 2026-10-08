import { parentPort, workerData } from 'node:worker_threads';
import { validateHwpx, renderHwpxToSvg } from 'kordoc';
try {
  const bytes = Buffer.from(workerData);
  const validation = await validateHwpx(bytes);
  if (!validation.ok) throw new Error('HWPX 구조 검사 실패');
  const r = await renderHwpxToSvg(bytes, { reflow: true });
  if (r.pageCount > 20) throw new Error('미리보기 20쪽 제한을 초과했습니다.');
  parentPort.postMessage({svg:r.svg, pages:r.pageCount, warnings:r.warnings, validation});
} catch(e) { parentPort.postMessage({error:e.message}); }
