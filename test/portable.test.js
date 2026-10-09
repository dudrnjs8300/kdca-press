import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {validateHwpx} from 'kordoc';
import request from 'supertest';
import {portable} from '../src/portable.js';
import {Artifacts} from '../src/artifacts.js';
import {createRemoteApp} from '../src/remote-app.js';
import {digest} from '../src/store.js';

const fixture=async name=>JSON.parse(await readFile(new URL(`../examples/${name}.json`,import.meta.url),'utf8'));
test('shared offline core produces valid, deterministic HWPX for three release types',async()=>{
  for(const kind of ['symposium','statistics','program']){
    const input=await fixture(kind);
    const a=await portable('generate',input),b=await portable('generate',input);
    assert.equal(a.ok,true);assert.equal(a.sha256,b.sha256);
    assert.equal((await validateHwpx(Buffer.from(a.hwpxBase64,'base64'))).ok,true);
    assert.equal(a.validation.nativeHancomVerified,false);
    assert.ok(a.markdown.includes(input.draft.title));
    assert.ok(a.html.includes('실제 HWPX의 쪽 나눔'));
  }
});
test('offline review rejects new numbers, changed units, invented quotes, altered evidence and bad tables',async()=>{
  const input=await fixture('statistics');
  for(const [sentence,code] of [['내성 분리주는 99999건이다.','unsupported_numbers'],['내성률은 1.0% 상승했다.','changed_units'],['관계자는 “모든 질병을 완벽하게 해결했다”라고 말했다.','unsupported_quote']]){
    const changed=structuredClone(input);changed.draft.paragraphs.push(sentence);
    const r=await portable('generate',changed);
    assert.equal(r.ok,false);assert.ok(r.review.errors.some(e=>e.code===code));assert.equal(r.hwpxBase64,undefined);
  }
  const changed=structuredClone(input);changed.draft.tables[0].rows[0].pop();
  assert.ok((await portable('review',changed)).errors.some(e=>e.code==='table_shape'));
  changed.draft.evidence[0].sourceQuote='원문에 없는 근거';
  assert.ok((await portable('review',changed)).errors.some(e=>e.code==='evidence_not_in_source'));
  await assert.rejects(portable('review',{...input,source:input.source+'\u0000'}));
});
test('temporary artifacts enforce owner, capability token, quota and expiration',async()=>{
  let clock=1000;
  const a=new Artifacts({ttlSeconds:10,maxBytes:1000,clock:()=>clock});
  const data={title:'테스트',hwpxBase64:'YWJj',markdown:'hello',review:{passed:true},validation:{ok:true},sha256:'test'};
  const {item,token}=a.put('alice',data,null);
  assert.equal(a.get(item.id,'bob'),undefined);assert.equal(a.get(item.id,'alice').title,'테스트');
  assert.equal(a.download(item.id,'x'.repeat(43)),undefined);assert.ok(a.download(item.id,token));
  assert.throws(()=>a.put('alice',{...data,markdown:'x'.repeat(2000)},null));
  clock=11001;assert.equal(a.download(item.id,token),undefined);assert.equal(a.items.size,0);
});
test('real stdio MCP client can discover, review, generate and read an HWPX resource',async()=>{
  const client=new Client({name:'kdca-stdio-test',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:['src/stdio.js'],cwd:new URL('..',import.meta.url).pathname,stderr:'pipe'});
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length,5);
    assert.ok((await client.listPrompts()).prompts.some(p=>p.name==='kdca-write'));
    const input=await fixture('symposium');
    assert.equal((await client.callTool({name:'kdca_review',arguments:input})).structuredContent.passed,true);
    const made=await client.callTool({name:'kdca_generate',arguments:input});assert.ok(!made.isError);
    const r=made.structuredContent;assert.equal(r.delivery.mode,'mcp_resource');
    const file=r.delivery.files.find(f=>f.format==='hwpx');
    const read=await client.readResource({uri:file.uri});
    const bytes=Buffer.from(read.contents[0].blob,'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);
    assert.equal((await validateHwpx(bytes)).ok,true);
    const embedded=await client.callTool({name:'kdca_get_artifact',arguments:{artifact_id:r.artifact_id,format:'hwpx'}});
    assert.equal(embedded.content[0].resource.blob,read.contents[0].blob);
  } finally {await client.close();}
});
test('remote MCP OAuth, file delivery and isolation work without a document database',async()=>{
  const server=createServer().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const cfg={baseUrl:origin,resource:origin+'/mcp',demo:true,local:true,secureCookie:false,trustProxy:0,allowedGithubIds:[]};
  const instance=createRemoteApp(cfg),web=request.agent(instance.app);server.on('request',instance.app);
  const client=new Client({name:'kdca-http-test',version:'1'}),other=new Client({name:'kdca-other',version:'1'});
  try {
    await request(instance.app).post('/mcp').send({}).expect(401);
    await web.post('/auth/demo').set('Origin',origin).send({}).expect(200);
    const session=(await web.get('/api/session')).body;
    const meta=(await web.post('/oauth/register').send({client_name:'KDCA test',redirect_uris:['http://127.0.0.1:9191/callback'],token_endpoint_auth_method:'none'}).expect(201)).body;
    const verifier=randomBytes(32).toString('base64url');
    const query={client_id:meta.client_id,redirect_uri:meta.redirect_uris[0],response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'test',scope:'pressroom',resource:cfg.resource};
    const redirect=await web.get('/oauth/authorize').query(query).expect(302);
    const pending=new URL(redirect.headers.location,origin).searchParams.get('request');
    const consent=await web.get(redirect.headers.location).expect(200);assert.ok(consent.text.includes('임시 보관'));
    const allow=await web.post('/oauth/consent').set('Origin',origin).type('form').send({request:pending,_csrf:session.csrf,decision:'allow'}).expect(302);
    const grant={client_id:meta.client_id,grant_type:'authorization_code',code:new URL(allow.headers.location).searchParams.get('code'),redirect_uri:query.redirect_uri,resource:cfg.resource,code_verifier:verifier};
    const tokens=(await web.post('/oauth/token').type('form').send(grant).expect(200)).body;
    await web.post('/oauth/token').type('form').send(grant).expect(400);
    await client.connect(new StreamableHTTPClientTransport(new URL(cfg.resource),{requestInit:{headers:{Authorization:`Bearer ${tokens.access_token}`}}}));
    instance.store.put('access',digest('other-token'),{userId:'other',scope:'pressroom',resource:cfg.resource,family:'other'},60);
    await other.connect(new StreamableHTTPClientTransport(new URL(cfg.resource),{requestInit:{headers:{Authorization:'Bearer other-token'}}}));
    const result=(await client.callTool({name:'kdca_generate',arguments:await fixture('program')})).structuredContent;
    assert.equal(result.delivery.mode,'temporary_download');
    const file=result.delivery.files.find(f=>f.format==='hwpx');
    const received=await fetch(file.url);assert.equal(received.status,200);assert.match(received.headers.get('cache-control'),/no-store/);
    assert.equal(createHash('sha256').update(Buffer.from(await received.arrayBuffer())).digest('hex'),result.sha256);
    const invalid=new URL(file.url);invalid.searchParams.set('token','x'.repeat(43));assert.equal((await fetch(invalid)).status,404);
    assert.equal((await other.callTool({name:'kdca_get_artifact',arguments:{artifact_id:result.artifact_id,format:'hwpx'}})).isError,true);
    assert.deepEqual(instance.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name),['kv','users']);
    instance.artifacts.items.get(result.artifact_id).expires=0;assert.equal((await fetch(file.url)).status,404);
  } finally {await client.close();await other.close();await new Promise(r=>server.close(r));instance.close();}
});
