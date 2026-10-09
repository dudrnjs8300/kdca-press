import {DurableObject} from 'cloudflare:workers';
import {httpServerHandler} from 'cloudflare:node';
import {createServer} from 'node:http';
import {loadConfig} from '../../src/config.js';
import {WorkerAuthStore,WorkerArtifacts,WorkerRateStore} from './store.js';
import {createWorkerApp} from './app.js';

export class PressApp extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    this.store=new WorkerAuthStore(ctx.storage.sql);
    this.artifacts=new WorkerArtifacts(ctx.storage.sql);
    const cfg=loadConfig({...env,TRUST_PROXY:'0'});
    let limiterIndex=0;
    cfg.createRateLimitStore=()=>new WorkerRateStore(ctx.storage.sql,'limit-'+limiterIndex++);
    const app=createWorkerApp(cfg,{store:this.store,artifacts:this.artifacts,engine:env.ENGINE.getByName('generator')});
    this.handler=httpServerHandler(createServer(app));
  }
  async fetch(request) {
    this.store.cleanup();this.artifacts.cleanup();
    this.ctx.storage.sql.exec('DELETE FROM rate_limits WHERE expires<=?',Date.now());
    // Recompute after every response: new files may expire before an existing
    // alarm scheduled for a long-lived login. Never defer deletion to that alarm.
    try {return await this.handler.fetch(request,this.env,this.ctx);}
    finally {await this.scheduleCleanup();}
  }
  async alarm() {
    this.store.cleanup();this.artifacts.cleanup();
    this.ctx.storage.sql.exec('DELETE FROM rate_limits WHERE expires<=?',Date.now());
    await this.scheduleCleanup();
  }
  async scheduleCleanup() {
    const nextFile=this.ctx.storage.sql.exec('SELECT min(expires) AS t FROM artifacts').one().t;
    const nextAuth=this.ctx.storage.sql.exec('SELECT min(expires)*1000 AS t FROM auth').one().t;
    const nextRate=this.ctx.storage.sql.exec('SELECT min(expires) AS t FROM rate_limits').one().t;
    const upcoming=[nextFile,nextAuth,nextRate].filter(x=>x!==null);
    if(upcoming.length)await this.ctx.storage.setAlarm(Math.max(Date.now()+60_000,Math.min(...upcoming)));
  }
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(!env.PUBLIC_BASE_URL || (!env.GITHUB_CLIENT_ID && env.DEMO_MODE!=='true'))
      return Response.json({status:'setup_required',service:'kdca-press',guide:'https://github.com/dudrnjs8300/kdca-press/blob/main/docs/CLOUDFLARE.md'},{status:503});
    if(url.origin!==env.PUBLIC_BASE_URL || (env.DEMO_MODE==='true'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname)))
      return Response.json({error:'invalid_origin'},{status:403});
    // The ordinary Worker does no parsing/generation; all CPU work is in DOs.
    return env.APP.getByName('kdca-press-v1').fetch(request);
  }
};
