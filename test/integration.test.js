import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import { Store, digest } from "../src/store.js";

const cfg = {
  baseUrl: "http://127.0.0.1:3000",
  resource: "http://127.0.0.1:3000/mcp",
  demo: true,
  local: true,
  secureCookie: false,
  trustProxy: 0,
  allowedGithubIds: [],
  maxSourceChars: 24000,
  maxDocuments: 20,
};
const fixture = createApp(cfg, { store: new Store(":memory:") });
let tokens, clientMeta, cookie, csrf;

test("OAuth PKCE flow binds redirect, user, client and audience; code cannot be replayed", async () => {
  const { app, store } = fixture,
    web = request.agent(app);
  await web
    .post("/auth/demo")
    .set("Origin", "https://attacker.example")
    .send({})
    .expect(403);
  const login = await web
    .post("/auth/demo")
    .set("Origin", cfg.baseUrl)
    .send({})
    .expect(200);
  cookie = login.headers["set-cookie"][0].split(";")[0];
  const session = await web.get("/api/session").expect(200);
  csrf = session.body.csrf;
  await web.post("/api/briefs").set("Origin", cfg.baseUrl).send({}).expect(403);
  const registration = await request(app)
    .post("/oauth/register")
    .send({
      client_name: "Integration Test",
      redirect_uris: ["http://127.0.0.1:9191/callback"],
      token_endpoint_auth_method: "none",
    })
    .expect(201);
  clientMeta = registration.body;
  await request(app)
    .post("/oauth/register")
    .send({ redirect_uris: ["javascript:alert(1)"] })
    .expect(400);
  const verifier = randomBytes(32).toString("base64url");
  const query = {
    client_id: clientMeta.client_id,
    redirect_uri: clientMeta.redirect_uris[0],
    response_type: "code",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "client-state",
    scope: "pressroom",
    resource: cfg.resource,
  };
  await web
    .get("/oauth/authorize")
    .query({ ...query, redirect_uri: "https://attacker.example" })
    .expect(400);
  await web
    .get("/oauth/authorize")
    .query({ ...query, resource: "https://other.example/mcp" })
    .expect(400);
  const authorize = await web.get("/oauth/authorize").query(query).expect(302);
  await web.get(authorize.headers.location).expect(200);
  const pending = new URL(
    authorize.headers.location,
    cfg.baseUrl,
  ).searchParams.get("request");
  const consent = await web
    .post("/oauth/consent")
    .set("Origin", cfg.baseUrl)
    .type("form")
    .send({ request: pending, _csrf: csrf, decision: "allow" })
    .expect(302);
  const returned = new URL(consent.headers.location);
  assert.equal(returned.searchParams.get("state"), "client-state");
  const grant = {
    client_id: clientMeta.client_id,
    grant_type: "authorization_code",
    code: returned.searchParams.get("code"),
    redirect_uri: query.redirect_uri,
    resource: cfg.resource,
    code_verifier: verifier,
  };
  await request(app)
    .post("/oauth/token")
    .type("form")
    .send({ ...grant, code_verifier: "x".repeat(43) })
    .expect(400);
  const exchange = await request(app)
    .post("/oauth/token")
    .type("form")
    .send(grant)
    .expect(200);
  tokens = exchange.body;
  await request(app).post("/oauth/token").type("form").send(grant).expect(400);
  await request(app)
    .get("/mcp")
    .expect(401)
    .expect("WWW-Authenticate", /oauth-protected-resource/);
  await request(app)
    .get("/.well-known/oauth-protected-resource/mcp")
    .expect(200)
    .expect((r) => assert.equal(r.body.resource, cfg.resource));
  assert.equal(
    store.get("access", digest(tokens.access_token)).userId,
    "local-demo",
  );
});

test("real SDK client initializes, discovers tools and creates all three HWPX cases", async () => {
  const server = fixture.app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`),
    client = new Client({ name: "pressroom-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      }),
    );
    const listing = await client.listTools();
    assert.equal(listing.tools.length, 5);
    for (const name of ["symposium", "statistics", "program"]) {
      const c = JSON.parse(
        await readFile(
          new URL(`../examples/${name}.json`, import.meta.url),
          "utf8",
        ),
      );
      const prepared = await client.callTool({
        name: "prepare_press_release",
        arguments: {
          source: c.source,
          kind: c.kind,
          public_data_confirmed: true,
        },
      });
      assert.equal(prepared.isError, undefined);
      const brief = JSON.parse(prepared.content[0].text);
      const review = await client.callTool({
        name: "review_press_release",
        arguments: { brief_id: brief.brief_id, draft: c.draft },
      });
      assert.equal(JSON.parse(review.content[0].text).passed, true);
      const created = await client.callTool({
        name: "create_press_release",
        arguments: { brief_id: brief.brief_id, draft: c.draft },
      });
      assert.equal(created.isError, undefined, created.content[0].text);
      const doc = JSON.parse(created.content[0].text);
      assert.ok(doc.document_id);
      const download = await request(fixture.app)
        .get(`/api/documents/${doc.document_id}/download`)
        .set("Cookie", cookie)
        .expect(200);
      assert.ok(download.headers["content-type"].includes("hwp+zip"));
      await request(fixture.app)
        .get(`/api/documents/${doc.document_id}/download`)
        .expect(401);
      const other = fixture.store.session(
        fixture.store.user("another-user", "another-user"),
      );
      await request(fixture.app)
        .get(`/api/documents/${doc.document_id}/download`)
        .set("Cookie", `pressroom=${other}`)
        .expect(404);
      await request(fixture.app)
        .get(`/api/documents/${doc.document_id}/preview`)
        .set("Cookie", cookie)
        .expect(200)
        .expect("Content-Security-Policy", /sandbox/);
    }
  } finally {
    await client.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("refresh rotation detects reuse and revokes whole token family", async () => {
  const grant = {
    client_id: clientMeta.client_id,
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    resource: cfg.resource,
  };
  await request(fixture.app)
    .post("/oauth/token")
    .type("form")
    .send({ ...grant, resource: "https://wrong.example" })
    .expect(400);
  const fresh = await request(fixture.app)
    .post("/oauth/token")
    .type("form")
    .send(grant)
    .expect(200);
  await request(fixture.app)
    .get("/mcp")
    .set("Authorization", `Bearer ${fresh.body.access_token}`)
    .expect(405);
  await request(fixture.app)
    .post("/oauth/token")
    .type("form")
    .send(grant)
    .expect(400);
  await request(fixture.app)
    .get("/mcp")
    .set("Authorization", `Bearer ${fresh.body.access_token}`)
    .expect(401);
  fixture.store.close();
});
