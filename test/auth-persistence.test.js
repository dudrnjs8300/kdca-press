import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, stat, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import request from 'supertest';
import {createRemoteApp} from '../src/remote-app.js';
import {loadConfig} from '../src/config.js';

// Exercise the real OAuth routes and MCP handler across two independent app instances.
test('PC restart preserves OAuth clients, sessions, tokens and revocation, but discards generated documents', async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'kdca-auth-'));
  const origin='http://127.0.0.1:3000';
  const cfg={baseUrl:origin,resource:origin+'/mcp',demo:true,local:true,secureCookie:false,trustProxy:0,allowedGithubIds:[],authDataDir:dir};
  let instance=createRemoteApp(cfg,{previewer:async()=>({unavailable:'test'})});
  const call=(token,method,params={})=>request(instance.app).post('/mcp')
    .set('Authorization',`Bearer ${token}`).set('Accept','application/json, text/event-stream')
    .send({jsonrpc:'2.0',id:1,method,params});
  try {
    const web=request.agent(instance.app);
    const login=await web.post('/auth/demo').set('Origin',origin).send({}).expect(200);
    const cookie=login.headers['set-cookie'][0].split(';')[0];
    const session=(await web.get('/api/session')).body;
    const meta=(await web.post('/oauth/register').send({client_name:'PC restart test',redirect_uris:['http://127.0.0.1:9191/callback'],token_endpoint_auth_method:'none'}).expect(201)).body;
    const verifier=randomBytes(32).toString('base64url');
    const auth=await web.get('/oauth/authorize').query({client_id:meta.client_id,redirect_uri:meta.redirect_uris[0],response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state:'restart',scope:'pressroom',resource:cfg.resource}).expect(302);
    const pending=new URL(auth.headers.location,origin).searchParams.get('request');
    await web.get(auth.headers.location).expect(200);
    const consent=await web.post('/oauth/consent').set('Origin',origin).type('form').send({request:pending,_csrf:session.csrf,decision:'allow'}).expect(302);
    const tokens=(await web.post('/oauth/token').type('form').send({client_id:meta.client_id,grant_type:'authorization_code',code:new URL(consent.headers.location).searchParams.get('code'),redirect_uri:meta.redirect_uris[0],resource:cfg.resource,code_verifier:verifier}).expect(200)).body;
    const input=JSON.parse(await readFile(new URL('../examples/statistics.json',import.meta.url),'utf8'));
    const made=await call(tokens.access_token,'tools/call',{name:'kdca_generate',arguments:input}).expect(200);
    assert.ok(!made.body.result.isError);
    const result=made.body.result.structuredContent;
    const download=new URL(result.delivery.files.find(f=>f.format==='hwpx').url);
    await request(instance.app).get(download.pathname+download.search).expect(200);
    assert.throws(()=>instance.store.put('documents','bad',{source:input.source}));
    const rows=instance.store.db.prepare('SELECT v FROM kv').all().map(r=>r.v).join('\n');
    assert.ok(!rows.includes(input.source));assert.ok(!rows.includes(input.draft.title));
    assert.ok(!rows.includes(tokens.access_token));assert.ok(!rows.includes(tokens.refresh_token));
    instance.close();
    instance=createRemoteApp(cfg);
    assert.equal((await request(instance.app).get('/api/session').set('Cookie',cookie)).body.user.id,'local-demo');
    assert.equal((await call(tokens.access_token,'tools/list').expect(200)).body.result.tools.length,5);
    await request(instance.app).get(download.pathname+download.search).expect(404);
    const refresh={client_id:meta.client_id,grant_type:'refresh_token',refresh_token:tokens.refresh_token,resource:cfg.resource};
    const next=(await request(instance.app).post('/oauth/token').type('form').send(refresh).expect(200)).body;
    instance.close();instance=createRemoteApp(cfg);
    await call(next.access_token,'tools/list').expect(200);
    // Refresh-token replay revokes its family, including after another restart.
    await request(instance.app).post('/oauth/token').type('form').send(refresh).expect(400);
    instance.close();instance=createRemoteApp(cfg);
    await call(next.access_token,'tools/list').expect(401);
    assert.deepEqual(instance.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name),['kv','users']);
    assert.equal((await stat(path.join(dir,'auth.sqlite'))).mode&0o777,0o600);
    assert.equal((await stat(dir)).mode&0o777,0o700);
  } finally {instance.close();await rm(dir,{recursive:true,force:true});}
});
test('PC config allows loopback tunnel but never exposes demo login publicly',()=>{
  const cfg=loadConfig({PUBLIC_BASE_URL:'https://press.example.org',HOST:'127.0.0.1',TRUST_PROXY:'loopback',GITHUB_CLIENT_ID:'test',GITHUB_CLIENT_SECRET:'test',AUTH_DATA_DIR:'/tmp/kdca-auth-example'});
  assert.equal(cfg.host,'127.0.0.1');assert.equal(cfg.trustProxy,'loopback');assert.equal(cfg.authDataDir,'/tmp/kdca-auth-example');
  assert.throws(()=>loadConfig({PUBLIC_BASE_URL:'https://press.example.org',DEMO_MODE:'true'}));
  assert.throws(()=>loadConfig({PUBLIC_BASE_URL:'http://localhost:3000',DEMO_MODE:'true',HOST:'0.0.0.0'}));
});
