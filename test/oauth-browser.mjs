// Real native form submissions: HTTP clients that inject Origin miss this bug.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash, randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {createRemoteApp} from '../src/remote-app.js';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
const callbackRequests = [];
const callbackServer = createServer((req, res) => {
  callbackRequests.push({url: req.url, referer: req.headers.referer});
  res.end('OAuth callback received');
});
const callbackOrigin = await listen(callbackServer);
const server = createServer();
const origin = await listen(server);
const instance = createRemoteApp({baseUrl: origin, resource: origin + '/mcp',
  demo: true, local: true, secureCookie: false, trustProxy: 0, allowedGithubIds: []});
const submittedOrigins = [];
server.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/oauth/consent') submittedOrigins.push(req.headers.origin);
  instance.app(req, res);
});
let browser;
try {
  browser = await chromium.launch({headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(origin + '/healthz');
  assert.equal(await page.evaluate(async () => (await fetch('/auth/demo', {method: 'POST'})).status), 200);
  const registered = await fetch(origin + '/oauth/register', {method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({client_name: 'Browser regression', redirect_uris: [callbackOrigin + '/callback']})});
  assert.equal(registered.status, 201);
  const client = await registered.json();
  for (const decision of ['allow', 'deny']) {
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({client_id: client.client_id, redirect_uri: client.redirect_uris[0],
      response_type: 'code', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256', state: 'browser-' + decision, scope: 'pressroom', resource: origin + '/mcp'});
    if (decision === 'allow') {
      // Recreate the old response policy to prove the browser-level regression.
      await page.route('**/oauth/consent?*', async route => {
        const response = await route.fetch();
        await route.fulfill({response, headers: {...response.headers(), 'referrer-policy': 'no-referrer'}});
      });
      await page.goto(origin + '/oauth/authorize?' + query);
      const consentUrl = page.url();
      const rejected = page.waitForResponse(r => r.url() === origin + '/oauth/consent' && r.request().method() === 'POST');
      await page.locator('button[value="allow"]').click();
      const response = await rejected;
      assert.equal(response.status(), 403);
      assert.equal((await response.json()).error_description, '요청을 확인할 수 없습니다. 페이지를 새로 열어 주세요.');
      assert.equal(submittedOrigins.at(-1), 'null');
      await page.unroute('**/oauth/consent?*');
      await page.goto(consentUrl);
    } else {
      await page.goto(origin + '/oauth/authorize?' + query);
    }
    await page.locator(`button[value="${decision}"]`).click();
    await page.waitForURL(callbackOrigin + '/callback?**', {timeout: 10000});
    const target = new URL(page.url());
    assert.equal(target.searchParams.get('state'), 'browser-' + decision);
    assert.equal(submittedOrigins.at(-1), origin, 'browser must send the real Origin, not null');
    assert.equal(callbackRequests.at(-1).referer, origin + '/', 'no consent request ID or query may leak');
    if (decision === 'deny') {
      assert.equal(target.searchParams.get('error'), 'access_denied');
      assert.equal(target.searchParams.has('code'), false);
    } else {
      const grant = {grant_type: 'authorization_code', client_id: client.client_id,
        redirect_uri: client.redirect_uris[0], code: target.searchParams.get('code'),
        code_verifier: verifier, resource: origin + '/mcp'};
      const tokens = await fetch(origin + '/oauth/token', {method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(grant)});
      assert.equal(tokens.status, 200);
      assert.ok((await tokens.json()).access_token);
    }
  }
  console.log('Browser OAuth passed: legacy 403 reproduced; fixed native allow/deny, real Origin, cross-origin callback, PKCE, no query leakage.');
} finally {
  await browser?.close();
  await Promise.all([server, callbackServer].map(s => new Promise(resolve => s.close(resolve))));
  instance.close();
}
