import { parentPort, workerData } from "node:worker_threads";
import { generateHwpx } from "./hwpx.js";
try {
  parentPort.postMessage({
    result: await generateHwpx(workerData.draft, workerData.options),
  });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
