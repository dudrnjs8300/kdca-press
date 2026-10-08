import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Store } from './store.js';
import { installAuth } from './auth.js';
import { Artifacts, formats } from './artifacts.js';
import { createPortableMcp } from './mcp-v2.js';

export function createRemoteApp(cfg,{store=new Store(':memory:'),artifacts=new Artifacts(),previewer}={}) {
  const app=express(); app.disable('x-powered-by'); app.set('trust proxy',cfg.trustProxy);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'"],imgSrc:["'self'",'data:'],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:cfg.local?null:[]}}}));
  app.use((req,res,next)=>{
    if(req.path.startsWith('/.well-known/') || ['/oauth/register','/oauth/token','/oauth/revoke','/mcp'].includes(req.path)) {
      res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers','Authorization, Content-Type, Accept, MCP-Protocol-Version, Last-Event-ID');
      res.set('Access-Control-Expose-Headers','WWW-Authenticate, MCP-Protocol-Version');
      if(req.method==='OPTIONS')return res.sendStatus(204);
    }
    if(req.path==='/mcp' && req.get('origin') && ![cfg.baseUrl,'https://chatgpt.com','https://claude.ai','https://gemini.google.com'].includes(req.get('origin')))return res.status(403).json({error:'invalid_origin'});
    if(req.path.startsWith('/artifacts/') || req.path.startsWith('/api/'))res.set('Cache-Control','private, no-store');
    next();
  });
  app.use(express.json({limit:'256kb'}),express.urlencoded({extended:false,limit:'16kb'}),cookieParser());
  const auth=installAuth(app,store,{...cfg,temporaryArtifacts:true});
  app.use(['/mcp','/artifacts'],rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-7',legacyHeaders:false}));
  app.get('/healthz',(req,res)=>res.json({status:'ok',service:'kdca-press',version:'0.2.0',storage:'temporary-memory'}));
  app.get('/api/session',(req,res)=>res.json({user:req.user||null,csrf:req.session?.csrf||null,demo:cfg.demo,mcpUrl:cfg.resource,artifactTtlMinutes:artifacts.ttl/60000}));
  app.get('/artifacts/:id/:format',(req,res)=>{
    const item=artifacts.download(req.params.id,req.query.token),format=req.params.format;
    if(!item || !Object.hasOwn(formats,format) || !item.files[format])return res.status(404).json({error:'not_found_or_expired'});
    res.set('Referrer-Policy','no-referrer');res.set('X-Robots-Tag','noindex, nofollow');
    if(format==='preview')res.set('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    else res.set('Content-Disposition',`attachment; filename="kdca-press.${formats[format].extension}"; filename*=UTF-8''${encodeURIComponent(item.title.slice(0,60)+'.'+formats[format].extension)}`);
    res.type(formats[format].mime).send(item.files[format]);
  });
  app.post('/mcp',auth.requireMcp,async(req,res,next)=>{
    const mcp=createPortableMcp({artifacts,owner:req.mcpUserId,baseUrl:cfg.baseUrl,previewer});
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{transport.close().catch(()=>{});mcp.close().catch(()=>{});});
    try {await mcp.connect(transport);await transport.handleRequest(req,res,req.body);}catch(e){if(!res.headersSent)next(e);}
  });
  app.all('/mcp',auth.requireMcp,(req,res)=>res.set('Allow','POST').status(405).json({error:'method_not_allowed'}));
  app.use(express.static(fileURLToPath(new URL('../web/',import.meta.url))));
  app.use((req,res)=>res.status(404).json({error:'not_found'}));
  app.use((err,req,res,next)=>{
    if(res.headersSent)return next(err);
    res.status(err.status||500).json({error:err.status?err.message:'처리에 실패했습니다. 잠시 후 다시 시도하세요.'});
  });
  const timer=setInterval(()=>{artifacts.cleanup();store.cleanup();},60000);timer.unref();
  return {app,store,artifacts,auth,close(){clearInterval(timer);store.close();artifacts.items.clear();}};
}
