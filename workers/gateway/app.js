import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {rateLimit} from 'express-rate-limit';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {installAuth} from '../../src/auth.js';
import {createMcp} from '../../src/mcp-server.js';
import {formats} from '../../src/artifacts.js';
import guide from '../../packages/kdca-press/references/editorial.md';
import formatGuide from '../../packages/kdca-press/references/draft-format.md';

export function createWorkerApp(cfg,{store,artifacts,engine}) {
  const app=express();app.disable('x-powered-by');
  app.use(helmet(),cookieParser());
  app.use((req,res,next)=>{
    res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');
    if(req.path.startsWith('/.well-known/')||['/mcp','/oauth/register','/oauth/token','/oauth/revoke'].includes(req.path)) {
      res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Methods','POST, GET, OPTIONS');
      res.set('Access-Control-Allow-Headers','Authorization, Content-Type, Accept, MCP-Protocol-Version, Last-Event-ID');
      res.set('Access-Control-Expose-Headers','WWW-Authenticate, MCP-Protocol-Version');
      if(req.method==='OPTIONS')return res.sendStatus(204);
    }
    if(req.path==='/mcp'&&req.get('origin')&&![cfg.baseUrl,'https://chatgpt.com','https://claude.ai','https://gemini.google.com'].includes(req.get('origin')))return res.status(403).json({error:'invalid_origin'});
    next();
  });
  app.use(express.json({limit:'256kb'}),express.urlencoded({extended:false,limit:'16kb'}));
  const auth=installAuth(app,store,{...cfg,temporaryArtifacts:true});
  app.use(['/mcp','/artifacts'],rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-7',legacyHeaders:false,store:cfg.createRateLimitStore()}));
  app.get('/healthz',(req,res)=>res.json({status:'ok',service:'kdca-press',runtime:'cloudflare-workers-durable-objects',authentication:'persistent',storage:'temporary-30-minutes',nativeHancomVerified:false}));
  app.get('/api/session',(req,res)=>res.json({user:req.user||null,csrf:req.session?.csrf||null,demo:cfg.demo,mcpUrl:cfg.resource,artifactTtlMinutes:30}));
  app.get('/',(req,res)=>res.type('html').send('<!doctype html><html lang="ko"><meta charset="utf-8"><title>KDCA 보도자료 MCP</title><h1>KDCA 보도자료 MCP</h1><p>질병관리청 양식을 참고한 개인용 작성 보조 도구입니다.</p><p>AI에서 이 사이트의 /mcp 주소를 연결하세요.</p><a href="https://dudrnjs8300.github.io/kdca-press/">설치 및 사용 안내</a></html>'));
  app.get('/style.css',(req,res)=>res.type('css').send('body{font:17px/1.7 sans-serif;max-width:800px;margin:60px auto;padding:24px;color:#17342b}button{padding:12px;margin:8px}'));
  app.get('/artifacts/:id/:format',(req,res)=>{
    const item=artifacts.download(req.params.id,req.query.token),format=req.params.format;
    if(!item||!Object.hasOwn(formats,format)||!item.files[format])return res.status(404).json({error:'not_found_or_expired'});
    res.set('X-Robots-Tag','noindex, nofollow');
    res.set('Content-Disposition',`attachment; filename="kdca-press.${formats[format].extension}"`);
    res.type(formats[format].mime).send(item.files[format]);
  });
  const portable=async(action,payload)=>{
    const response=await engine.fetch(new Request(`https://engine.internal/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.error||'문서 생성기에 연결할 수 없습니다.'),{status:response.status});
    return result;
  };
  app.post('/mcp',auth.requireMcp,async(req,res,next)=>{
    const server=createMcp({artifacts,owner:req.mcpUserId,baseUrl:cfg.baseUrl,portable,guide,formatGuide,
      artifactLifetimeNote:'파일 링크는 생성 후 30분 동안 유효합니다. 링크를 가진 사람은 만료 전까지 다운로드할 수 있습니다. 만료 파일은 자동 삭제합니다.',
      previewer:async()=>({unavailable:'Workers에서는 HWPX 파일과 본문을 제공합니다. 쪽 배치는 한글에서 확인하세요.'})});
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{transport.close().catch(()=>{});server.close().catch(()=>{});});
    try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}catch(e){if(!res.headersSent)next(e);}
  });
  app.all('/mcp',auth.requireMcp,(req,res)=>res.set('Allow','POST').status(405).json({error:'method_not_allowed'}));
  app.use((req,res)=>res.status(404).json({error:'not_found'}));
  app.use((e,req,res,next)=>{if(res.headersSent)return next(e);res.status(e.status||500).json({error:(e.status||cfg.demo)?e.message:'처리에 실패했습니다.'});});
  return app;
}
