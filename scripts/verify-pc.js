// Run on the PC hosting the service. Authentication stays in memory, never in argv/files.
import {createServer} from 'node:http';
import {randomBytes, createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const lines=(await readFile(path.join(homedir(),'.config/kdca-press/server.env'),'utf8')).trim().split('\n');
const env=Object.fromEntries(lines.map(line=>{const i=line.indexOf('=');return [line.slice(0,i),JSON.parse(line.slice(i+1))];}));
const base=new URL(env.PUBLIC_BASE_URL);
if(base.protocol!=='https:'||base.pathname!=='/')throw new Error('Expected HTTPS origin');
const verifier=randomBytes(32).toString('base64url'),state=randomBytes(32).toString('base64url');
let resolveCode,rejectCode,timer;
const codePromise=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
// Prevent an unhandled rejection while earlier network operations are completing.
codePromise.catch(()=>{});
const callback=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname!=='/callback'||url.searchParams.get('state')!==state){res.writeHead(400).end('Invalid callback');return;}
  const code=url.searchParams.get('code');
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');
  if(!code){res.writeHead(400).end('Authorization failed.');rejectCode(new Error('Authorization failed'));return;}
  res.end('로그인이 완료됐습니다. WSL 터미널로 돌아가세요.');resolveCode(code);
});
const client=new Client({name:'kdca-pc-acceptance',version:'0.3.0'});
async function json(route,options){
  const response=await fetch(new URL(route,base),{...options,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`${route}: HTTP ${response.status}`);
  return response.json();
}
try {
  await new Promise((resolve,reject)=>{callback.once('error',reject);callback.listen(0,'127.0.0.1',resolve);});
  const redirect=`http://127.0.0.1:${callback.address().port}/callback`;
  const registered=await json('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'KDCA PC 연결 시험',redirect_uris:[redirect],token_endpoint_auth_method:'none'})});
  const resource=base.origin+'/mcp';
  const url=new URL('/oauth/authorize',base);
  url.search=new URLSearchParams({client_id:registered.client_id,redirect_uri:redirect,response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state,scope:'pressroom',resource});
  console.log('이 PC의 Windows 브라우저에서 아래 주소를 열고 GitHub 로그인과 연결 승인을 완료하세요.\n'+url.href);
  timer=setTimeout(()=>rejectCode(new Error('Login timed out after 5 minutes')),300000);
  const code=await codePromise;clearTimeout(timer);
  const tokens=await json('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:registered.client_id,code,code_verifier:verifier,redirect_uri:redirect,resource})});
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:`Bearer ${tokens.access_token}`}}}));
  const list=await client.listTools();if(list.tools.length!==5)throw new Error('Unexpected tool list');
  const output=path.join(homedir(),'kdca-mcp-results',new Date().toISOString().replace(/[:.]/g,'-'));
  await mkdir(output,{recursive:true,mode:0o700});
  for(const kind of ['symposium','statistics','program']){
    const input=JSON.parse(await readFile(new URL(`../examples/${kind}.json`,import.meta.url),'utf8'));
    const result=await client.callTool({name:'kdca_generate',arguments:input},undefined,{timeout:90000});
    if(result.isError)throw new Error(kind+': generation failed');
    const data=result.structuredContent;
    const file=data.delivery.files.find(f=>f.format==='hwpx');
    const response=await fetch(file.url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(kind+': download failed');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(createHash('sha256').update(bytes).digest('hex')!==data.sha256)throw new Error(kind+': hash mismatch');
    await writeFile(path.join(output,kind+'.hwpx'),bytes,{flag:'wx',mode:0o600});
    console.log(`PASS ${kind}: HWPX 생성·다운로드·SHA256 일치`);
  }
  console.log('시험 파일: '+output);
  console.log('실제 AI 계정의 설치·도구 호출과 한컴 열기·저장은 이어서 확인해야 합니다.');
  await json('/oauth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:registered.client_id,token:tokens.refresh_token})}).catch(()=>{});
} finally {
  clearTimeout(timer);await client.close();callback.close();callback.closeAllConnections();
}
