import { Worker } from "node:worker_threads";
let active = 0;
const queue = [];
function next() {
  if (active < 1 && queue.length) queue.shift()();
}
export function render(draft, options = {}) {
  if (queue.length >= 8)
    return Promise.reject(
      Object.assign(
        new Error("문서 생성 요청이 많습니다. 잠시 후 다시 시도해 주세요."),
        { status: 503 },
      ),
    );
  return new Promise((resolve, reject) => {
    const run = () => {
      active++;
      const worker = new Worker(
        new URL("./render-worker.js", import.meta.url),
        {
          workerData: { draft, options },
          resourceLimits: { maxOldGenerationSizeMb: 256 },
          execArgv: [],
        },
      );
      let finished = false;
      const finish = (err, result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.terminate();
        active--;
        next();
        if (err) reject(err);
        else resolve({ ...result, hwpx: Buffer.from(result.hwpx) });
      };
      const timer = setTimeout(
        () =>
          finish(
            Object.assign(
              new Error(
                "문서 생성 시간이 초과됐습니다. 긴 표나 문단을 나눠 주세요.",
              ),
              { status: 503 },
            ),
          ),
        45000,
      );
      worker.once("message", (m) =>
        finish(m.error ? new Error(m.error) : null, m.result),
      );
      worker.once("error", finish);
      worker.once("exit", (code) => {
        if (!finished)
          finish(new Error(`문서 생성 작업이 종료됐습니다 (${code}).`));
      });
    };
    if (active < 1) run();
    else queue.push(run);
  });
}
