import { portable } from './portable.js';
import { validateHwpx, renderHwpxToSvg } from 'kordoc';

// Legacy web routes use the same template and engine as Skill, stdio and Workers.
export async function generateHwpx(draft, { source, kind = 'general' } = {}) {
  const result = await portable('generate', { source, kind, draft });
  if (!result.ok) throw new Error('원문 검토를 통과하지 못했습니다.');
  const hwpx = Buffer.from(result.hwpxBase64, 'base64');
  const validation = await validateHwpx(hwpx);
  if (!validation.ok) throw new Error('HWPX 구조 검사 실패');
  const rendered = await renderHwpxToSvg(hwpx, { reflow: true });
  if (rendered.pageCount > 20) throw new Error('문서가 20쪽을 초과했습니다. 내용을 나눠 주세요.');
  return { hwpx, validation, previews: { svg: rendered.svg, pages: rendered.pageCount,
    width: rendered.width, height: rendered.height, warnings: rendered.warnings } };
}
