// Real workerd + Python/WASM integration. Wall times are NOT Cloudflare CPU bills.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {readFile,mkdir,writeFile,open} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {validateHwpx} from 'kordoc';
import {portable} from '../src/portable.js';

const base='http://127.0.0.1:8787',children=[],clients=[];
const out=new URL('../test-output/workers/',import.meta.url);
await mkdir(out,{recursive:true});
const persist=new URL('state-'+Date.now()+'/',out).pathname;
async function start(name,args,cwd) {
  const log=await open(new URL(name+'.log',out),'w');
  const child=spawn(process.execPath,[new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url).pathname,'dev',...args,'--persist-to',persist+'/'+name],
    {cwd,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['ignore',log.fd,log.fd],detached:process.platform!=='win32'});
  children.push(child);await log.close();return child;
}
async function ready(url,child) {
  for(let i=0;i<180;i++) {
    if(child.exitCode!==null)throw new Error('Runtime exited; inspect test-output/workers/*.log');
    try {const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(r.status<500)return;}catch{}
    await delay(500);
  }
  throw new Error('Runtime did not become ready');
}
let cookie='';
async function web(route,options={}) {
  const r=await fetch(base+route,{redirect:'manual',...options,headers:{...options.headers,...(cookie?{cookie}:{})}});
  for(const set of r.headers.getSetCookie())if(set.startsWith('pressroom='))cookie=set.split(';')[0];
  return r;
}
const form=data=>({method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':base},body:new URLSearchParams(data)});
let token,registration;
async function client() {
  const c=new Client({name:'kdca-workers-test',version:'1'});clients.push(c);
  await c.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));return c;
}
try {
  const engine=await start('engine',['--ip','127.0.0.1','--port','8788'],new URL('../workers/engine/',import.meta.url).pathname);
  await ready('http://127.0.0.1:8788/no-route',engine);
  const gateway=await start('gateway',['--config','workers/gateway/wrangler.jsonc','--ip','127.0.0.1','--port','8787','--var',`PUBLIC_BASE_URL:${base}`,'--var','DEMO_MODE:true','--var','ALLOWED_GITHUB_IDS:local-demo'],new URL('..',import.meta.url).pathname);
  await ready(base+'/healthz',gateway);
  assert.equal((await web('/mcp',{method:'POST'})).status,401);
  assert.equal((await web('/auth/demo',{method:'POST',headers:{Origin:base}})).status,200);
  const session=await (await web('/api/session')).json();
  const registered=await web('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Workers runtime acceptance',redirect_uris:['http://127.0.0.1:9999/callback'],token_endpoint_auth_method:'none'})});
  registration=await registered.json();assert.equal(registered.status,201,JSON.stringify(registration));
  const verifier=randomBytes(32).toString('base64url');
  const q=new URLSearchParams({client_id:registration.client_id,redirect_uri:registration.redirect_uris[0],response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',scope:'pressroom',resource:base+'/mcp'});
  const pending=(await web('/oauth/authorize?'+q)).headers.get('location');assert.match(pending,/^\/oauth\/consent/);
  const consentPage=await web(pending);assert.equal(consentPage.status,200);
  assert.equal(consentPage.headers.get('referrer-policy'),'strict-origin');
  assert.match(consentPage.headers.get('content-security-policy'),/form-action 'self' http:\/\/127\.0\.0\.1:9999(?:;|$)/);
  const badConsent=form({request:new URL(pending,base).searchParams.get('request'),_csrf:session.csrf,decision:'allow'});
  badConsent.headers.Origin='null';assert.equal((await web('/oauth/consent',badConsent)).status,403);
  const consent=await web('/oauth/consent',form({request:new URL(pending,base).searchParams.get('request'),_csrf:session.csrf,decision:'allow'}));
  const grant={grant_type:'authorization_code',client_id:registration.client_id,code:new URL(consent.headers.get('location')).searchParams.get('code'),code_verifier:verifier,redirect_uri:registration.redirect_uris[0],resource:base+'/mcp'};
  const tokens=await (await web('/oauth/token',form(grant))).json();token=tokens.access_token;assert.ok(token);
  assert.equal((await web('/oauth/token',form(grant))).status,400);
  const c=await client();assert.equal((await c.listTools()).tools.length,5);
  const results=[];
  for(const kind of ['symposium','statistics','program']) {
    const input=JSON.parse(await readFile(new URL(`../examples/${kind}.json`,import.meta.url),'utf8'));
    const prepared=await c.callTool({name:'kdca_prepare',arguments:{source:input.source,kind}});
    assert.ok(!prepared.isError,JSON.stringify(prepared.structuredContent));
    assert.equal(prepared.structuredContent.source_sha256,createHash('sha256').update(input.source.trim()).digest('hex'));
    assert.ok(prepared.structuredContent.guide.includes('KDCA'));
    assert.equal((await c.callTool({name:'kdca_review',arguments:input})).structuredContent.passed,true);
    const timings=[];let expectedHash;
    for(let i=0;i<5;i++) {
      const start=performance.now();
      const generated=await c.callTool({name:'kdca_generate',arguments:input},undefined,{timeout:90000});
      assert.ok(!generated.isError,JSON.stringify(generated.structuredContent));
      const ms=performance.now()-start,data=generated.structuredContent;timings.push(ms);
      const file=data.delivery.files.find(f=>f.format==='hwpx');
      const response=await fetch(file.url);assert.equal(response.status,200);
      const bytes=Buffer.from(await response.arrayBuffer());
      assert.equal(createHash('sha256').update(bytes).digest('hex'),data.sha256);
      assert.equal((await validateHwpx(bytes)).ok,true);
      if(expectedHash)assert.equal(data.sha256,expectedHash);expectedHash=data.sha256;
      if(i===0) {
        await writeFile(new URL(kind+'.hwpx',out),bytes);
        const invalid=new URL(file.url);invalid.searchParams.set('token','x'.repeat(43));assert.equal((await fetch(invalid)).status,404);
        const baseline=await portable('generate',input);
        // Compare content after decompression; different zlib builds may produce
        // different compressed bytes for identical XML.
        const JSZip=(await import('jszip')).default;
        const a=await JSZip.loadAsync(bytes),b=await JSZip.loadAsync(Buffer.from(baseline.hwpxBase64,'base64'));
        assert.deepEqual(Object.keys(a.files),Object.keys(b.files));
        for(const name of Object.keys(a.files))assert.equal(await a.file(name).async('string'),await b.file(name).async('string'),name);
      }
    }
    results.push({kind,runs:timings.length,first_ms:+timings[0].toFixed(2),median_ms:+[...timings].sort((a,b)=>a-b)[2].toFixed(2),max_ms:+Math.max(...timings).toFixed(2),sha256:expectedHash});
    console.log('PASS',kind,JSON.stringify(results.at(-1)));
  }
  const bad=JSON.parse(await readFile(new URL('../examples/statistics.json',import.meta.url),'utf8'));
  const stress=structuredClone(bad);
  stress.draft.paragraphs=Array.from({length:24},()=>bad.draft.paragraphs[0]);
  stress.draft.evidence=Array.from({length:60},()=>bad.draft.evidence[0]);
  const stressStarted=performance.now();
  const large=await c.callTool({name:'kdca_generate',arguments:stress},undefined,{timeout:90000});
  assert.ok(!large.isError,JSON.stringify(large.structuredContent));
  const stressMs=+(performance.now()-stressStarted).toFixed(2);
  console.log('PASS 24 paragraphs / 60 evidence entries:',stressMs,'ms wall');
  bad.draft.paragraphs.push('내성 분리주는 99999건이다.');
  const rejected=await c.callTool({name:'kdca_generate',arguments:bad});assert.equal(rejected.isError,true);
  assert.ok(rejected.structuredContent.review.errors.some(e=>e.code==='unsupported_numbers'));
  await web('/oauth/revoke',form({client_id:registration.client_id,token:tokens.refresh_token}));
  await assert.rejects(c.listTools());
  const report={measured_at:new Date().toISOString(),runtime:'local workerd + Python/WASM Durable Objects',metric:'MCP call end-to-end wall time, NOT production CPU time',production_cpu_verified:false,fixtures:'three fictional pre-authored drafts; not an AI writing evaluation',stress:{paragraphs:24,evidence_entries:60,wall_ms:stressMs},checks:['OAuth PKCE/code replay/revocation','MCP SDK discovery','15 fixture HWPX generations + 1 expanded-input generation','ZIP/XML and native-core equivalence','download SHA256','invalid capability token','fabricated number rejected'],results};
  await writeFile(new URL('benchmark.json',out),JSON.stringify(report,null,2)+'\n');
  console.log('Workers runtime acceptance passed. Production CPU still requires deployment telemetry.');
} finally {
  for(const c of clients)await c.close().catch(()=>{});
  for(const child of children)if(child.exitCode===null)try {process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGTERM');}catch{}
}
