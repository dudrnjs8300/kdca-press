import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../packages/kdca-press/scripts/kdca_press.py', import.meta.url));
let active = 0;
export async function portable(action, payload) {
  if (!['prepare', 'review', 'generate'].includes(action)) throw new Error('Invalid action');
  if (active >= 4) throw Object.assign(new Error('처리 중인 요청이 많습니다. 잠시 후 다시 시도하세요.'), { status: 503 });
  const input = JSON.stringify(payload);
  if (Buffer.byteLength(input) > 262144) throw Object.assign(new Error('입력이 너무 큽니다.'), { status: 413 });
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.env.PYTHON_BIN || 'python3', [script, action, '--stdio'], { stdio: ['pipe','pipe','pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONIOENCODING: 'utf-8' } });
      const parts = []; let bytes = 0, ended = false;
      const finish = (err, value) => {
        if (ended) return;
        ended = true; clearTimeout(timer);
        if (err) { child.kill('SIGKILL'); reject(err); } else resolve(value);
      };
      const timer = setTimeout(() => finish(Object.assign(new Error('문서 처리 시간이 초과됐습니다.'), {status:503})), 20000);
      child.stdout.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 4_000_000) finish(new Error('결과 크기 제한을 초과했습니다.'));
        else parts.push(chunk);
      });
      // Do not log input, Python tracebacks, or document text.
      child.stderr.resume();
      child.on('error', () => finish(new Error('Python 3.10 이상 실행 환경을 확인하세요.')));
      child.stdin.on('error', () => {});
      child.on('close', code => {
        if (ended) return;
        try {
          const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
          if (code !== 0 && !result.review && result.passed === undefined)
            return finish(Object.assign(new Error(result.error || '입력을 확인하세요.'), { status: 400 }));
          finish(null, result);
        } catch { finish(new Error('문서 생성기 응답을 읽을 수 없습니다.')); }
      });
      child.stdin.end(input);
    });
  } finally { active--; }
}
