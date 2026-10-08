import { Worker } from 'node:worker_threads';
let active=0;
export async function preview(hwpx) {
  if(active>=2) return {unavailable:'미리보기 생성 요청이 많습니다. HWPX는 생성됐습니다.'};
  active++;
  try {
    return await new Promise(resolve=>{
      const worker=new Worker(new URL('./preview-worker.js',import.meta.url),{workerData:hwpx,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
      let done=false;
      const finish=value=>{if(done)return; done=true;clearTimeout(timer);worker.terminate();resolve(value);};
      const timer=setTimeout(()=>finish({unavailable:'미리보기 시간 초과. HWPX 내용·구조 검사는 통과했습니다.'}),30000);
      worker.once('message',r=>finish(r.error?{unavailable:r.error}:r));
      worker.once('error',()=>finish({unavailable:'미리보기를 만들지 못했습니다.'}));
      worker.once('exit',()=>{if(!done)finish({unavailable:'미리보기 작업이 종료됐습니다.'});});
    });
  } finally {active--;}
}
