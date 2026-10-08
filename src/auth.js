import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { secret, digest, now } from "./store.js";

const scope = "pressroom";
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fail = (res, code, message, status = 400) =>
  res.status(status).json({ error: code, error_description: message });
const loopback = (host) => ["127.0.0.1", "localhost", "[::1]"].includes(host);
export function validRedirect(value) {
  try {
    const u = new URL(value);
    return (
      !u.username &&
      !u.password &&
      !u.hash &&
      (u.protocol === "https:" ||
        (u.protocol === "http:" && loopback(u.hostname)))
    );
  } catch {
    return false;
  }
}
export function installAuth(app, store, cfg) {
  const cookie = {
    httpOnly: true,
    secure: cfg.secureCookie,
    sameSite: "lax",
    path: "/",
  };
  const cookieName = cfg.secureCookie ? "__Host-pressroom" : "pressroom";
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.use(["/oauth", "/auth"], limit, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    const raw = req.cookies?.[cookieName];
    const s =
      typeof raw === "string" ? store.get("session", digest(raw)) : undefined;
    if (
      s &&
      (!cfg.allowedGithubIds.length || cfg.allowedGithubIds.includes(s.user.id))
    ) {
      req.session = s;
      req.user = s.user;
    }
    next();
  });
  const requireUser = (req, res, next) =>
    req.user
      ? next()
      : fail(res, "login_required", "로그인이 필요합니다.", 401);
  const csrf = (req, res, next) => {
    if (
      !req.session ||
      req.get("origin") !== cfg.baseUrl ||
      !same(req.get("x-csrf-token") || req.body?._csrf, req.session.csrf)
    )
      return fail(
        res,
        "invalid_request",
        "요청을 확인할 수 없습니다. 페이지를 새로 열어 주세요.",
        403,
      );
    next();
  };
  const issueSession = (res, user, oldToken) => {
    if (oldToken) store.remove("session", digest(oldToken));
    const t = store.session(user);
    res.cookie(cookieName, t, { ...cookie, maxAge: 7 * 86400000 });
  };
  app.get("/auth/github", (req, res) => {
    if (!cfg.githubClientId) return res.redirect("/?login=demo");
    const returnTo =
      typeof req.query.next === "string" &&
      /^(?:\/(?:\?document=[0-9a-f-]{36})?|\/oauth\/consent\?request=[A-Za-z0-9_-]{43})$/.test(
        req.query.next,
      )
        ? req.query.next
        : "/";
    const state = secret(),
      binding = secret(),
      verifier = secret();
    store.put(
      "github",
      digest(state),
      { binding: digest(binding), verifier, returnTo },
      600,
    );
    res.cookie("pressroom-login", binding, { ...cookie, maxAge: 600000 });
    const u = new URL("https://github.com/login/oauth/authorize");
    for (const [k, v] of Object.entries({
      client_id: cfg.githubClientId,
      redirect_uri: `${cfg.baseUrl}/auth/github/callback`,
      scope: "read:user",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }))
      u.searchParams.set(k, v);
    res.redirect(u.href);
  });
  app.get("/auth/github/callback", async (req, res, next) => {
    try {
      const state = String(req.query.state || ""),
        binding = req.cookies?.["pressroom-login"];
      const pending = store.get("github", digest(state));
      if (
        !pending ||
        !binding ||
        !same(pending.binding, digest(binding)) ||
        typeof req.query.code !== "string"
      )
        return fail(
          res,
          "invalid_request",
          "로그인 요청이 만료되었거나 일치하지 않습니다.",
        );
      store.remove("github", digest(state));
      res.clearCookie("pressroom-login", cookie);
      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: cfg.githubClientId,
            client_secret: cfg.githubClientSecret,
            code: req.query.code,
            code_verifier: pending.verifier,
            redirect_uri: `${cfg.baseUrl}/auth/github/callback`,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const token = await response.json();
      if (!response.ok || !token.access_token)
        return fail(res, "login_failed", "GitHub 로그인에 실패했습니다.", 401);
      const profileResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "kdca-press-mcp",
        },
        signal: AbortSignal.timeout(15000),
      });
      const profile = await profileResponse.json();
      if (
        !profileResponse.ok ||
        !Number.isSafeInteger(profile.id) ||
        typeof profile.login !== "string"
      )
        return fail(
          res,
          "login_failed",
          "GitHub 계정을 확인할 수 없습니다.",
          401,
        );
      if (
        cfg.allowedGithubIds.length &&
        !cfg.allowedGithubIds.includes(String(profile.id))
      )
        return fail(
          res,
          "access_denied",
          "이 서비스에 허용된 계정이 아닙니다.",
          403,
        );
      const user = store.user(String(profile.id), profile.login);
      // Upstream GitHub access tokens are never stored or reused as MCP tokens.
      issueSession(res, user, req.cookies?.[cookieName]);
      res.redirect(pending.returnTo);
    } catch (e) {
      next(e);
    }
  });
  app.post("/auth/demo", (req, res) => {
    if (!cfg.demo) return res.sendStatus(404);
    if (req.get("origin") !== cfg.baseUrl) return res.sendStatus(403);
    issueSession(
      res,
      store.user("local-demo", "로컬 체험"),
      req.cookies?.[cookieName],
    );
    res.json({ ok: true });
  });
  app.post("/auth/logout", requireUser, csrf, (req, res) => {
    store.remove("session", digest(req.cookies[cookieName]));
    res.clearCookie(cookieName, cookie);
    res.json({ ok: true });
  });
  const metadata = {
    issuer: cfg.baseUrl,
    authorization_endpoint: `${cfg.baseUrl}/oauth/authorize`,
    token_endpoint: `${cfg.baseUrl}/oauth/token`,
    registration_endpoint: `${cfg.baseUrl}/oauth/register`,
    revocation_endpoint: `${cfg.baseUrl}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [scope],
  };
  app.get("/.well-known/oauth-authorization-server", (req, res) =>
    res.json(metadata),
  );
  const resourceMetadata = {
    resource: cfg.resource,
    authorization_servers: [cfg.baseUrl],
    scopes_supported: [scope],
    bearer_methods_supported: ["header"],
    resource_name: "KDCA 보도자료",
  };
  app.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ],
    (req, res) => res.json(resourceMetadata),
  );
  app.post(
    "/oauth/register",
    rateLimit({
      windowMs: 3600000,
      limit: 15,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
    (req, res) => {
      const parsed = z
        .object({
          client_name: z.string().min(1).max(100).default("MCP client"),
          redirect_uris: z
            .array(z.string().max(2000).refine(validRedirect))
            .min(1)
            .max(10),
          token_endpoint_auth_method: z
            .enum(["none", "client_secret_post", "client_secret_basic"])
            .default("none"),
          grant_types: z
            .array(z.enum(["authorization_code", "refresh_token"]))
            .optional(),
          response_types: z.array(z.literal("code")).optional(),
        })
        .passthrough()
        .safeParse(req.body);
      if (!parsed.success)
        return fail(
          res,
          "invalid_client_metadata",
          "HTTPS 또는 loopback 주소, code 응답과 authorization_code/refresh_token만 지원합니다.",
        );
      if (store.count("client") >= 1000)
        return fail(
          res,
          "temporarily_unavailable",
          "클라이언트 등록 한도에 도달했습니다.",
          503,
        );
      const c = {
        client_id: secret(),
        client_name: parsed.data.client_name,
        redirect_uris: parsed.data.redirect_uris,
        token_endpoint_auth_method: parsed.data.token_endpoint_auth_method,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope,
        client_id_issued_at: now(),
      };
      const clientSecret =
        c.token_endpoint_auth_method === "none" ? undefined : secret();
      store.put(
        "client",
        c.client_id,
        { ...c, secretHash: clientSecret ? digest(clientSecret) : undefined },
        365 * 86400,
      );
      res.status(201).json({
        ...c,
        ...(clientSecret
          ? { client_secret: clientSecret, client_secret_expires_at: 0 }
          : {}),
      });
    },
  );
  app.get("/oauth/authorize", (req, res) => {
    const q = req.query;
    if (typeof q.client_id !== "string")
      return fail(res, "invalid_request", "client_id가 필요합니다.");
    const c = store.get("client", q.client_id);
    if (
      !c ||
      typeof q.redirect_uri !== "string" ||
      !c.redirect_uris.includes(q.redirect_uri)
    )
      return fail(
        res,
        "invalid_request",
        "등록된 redirect_uri와 일치해야 합니다.",
      );
    if (
      q.response_type !== "code" ||
      q.code_challenge_method !== "S256" ||
      typeof q.code_challenge !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge)
    )
      return fail(
        res,
        "invalid_request",
        "S256 PKCE authorization code가 필요합니다.",
      );
    if (q.resource && q.resource !== cfg.resource)
      return fail(
        res,
        "invalid_target",
        "MCP 리소스 주소가 일치하지 않습니다.",
      );
    if (q.scope && q.scope !== scope)
      return fail(res, "invalid_scope", "pressroom 범위만 지원합니다.");
    if (q.state && (typeof q.state !== "string" || q.state.length > 2048))
      return fail(res, "invalid_request", "잘못된 state입니다.");
    const id = secret();
    store.put(
      "authorization",
      id,
      {
        clientId: c.client_id,
        clientName: c.client_name,
        redirectUri: q.redirect_uri,
        challenge: q.code_challenge,
        state: q.state || "",
        resource: cfg.resource,
      },
      600,
    );
    const target = `/oauth/consent?request=${id}`;
    res.redirect(
      req.user ? target : `/auth/github?next=${encodeURIComponent(target)}`,
    );
  });
  app.get("/oauth/consent", (req, res) => {
    const id = String(req.query.request || ""),
      p = store.get("authorization", id);
    if (!p)
      return fail(
        res,
        "invalid_request",
        "연결 요청이 만료됐습니다. AI 앱에서 연결을 다시 시작하세요.",
      );
    if (!req.user)
      return res.redirect(
        `/auth/github?next=${encodeURIComponent(`/oauth/consent?request=${id}`)}`,
      );
    if (p.userId && p.userId !== req.user.id)
      return fail(res, "access_denied", "로그인 계정이 달라졌습니다.", 403);
    p.userId = req.user.id;
    store.put("authorization", id, p, 600);
    res
      .type("html")
      .send(
        `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><title>AI 연결 승인 · KDCA 보도자료</title><main class="consent card"><div class="eyebrow">KDCA 보도자료</div><h1>AI 앱을 연결할까요?</h1><p><strong>${escape(p.clientName)}</strong>에서 <strong>${escape(req.user.login)}</strong>${cfg.temporaryArtifacts ? "님의 공개 원문과 초안을 검사하고 한글 파일을 생성할 수 있습니다. 생성 파일은 임시 보관 후 삭제됩니다." : "님의 공개 원문을 등록하고, 보도자료를 작성·검토·저장하며 문서 목록과 내용을 읽을 수 있습니다."}</p><p class="muted">연결 대상: ${escape(new URL(p.redirectUri).origin)}<br>GitHub 저장소 권한은 제공하지 않습니다. 이 권한으로 문서가 외부에 게시되지는 않습니다.</p><form method="post" action="/oauth/consent"><input type="hidden" name="request" value="${escape(id)}"><input type="hidden" name="_csrf" value="${escape(req.session.csrf)}"><button name="decision" value="allow" class="primary">연결 허용</button><button name="decision" value="deny" class="secondary">취소</button></form></main></html>`,
      );
  });
  app.post("/oauth/consent", requireUser, csrf, (req, res) => {
    const id = String(req.body.request || ""),
      p = store.get("authorization", id);
    if (!p || p.userId !== req.user.id)
      return fail(res, "invalid_request", "연결 요청이 만료됐습니다.");
    store.remove("authorization", id);
    const target = new URL(p.redirectUri);
    if (p.state) target.searchParams.set("state", p.state);
    if (req.body.decision !== "allow") {
      target.searchParams.set("error", "access_denied");
      return res.redirect(target.href);
    }
    const code = secret();
    store.put("code", digest(code), p, 90);
    target.searchParams.set("code", code);
    res.redirect(target.href);
  });
  function clientFrom(req) {
    let id = req.body?.client_id,
      sec = req.body?.client_secret,
      method = sec ? "client_secret_post" : "none";
    const header = req.get("authorization");
    if (header?.startsWith("Basic ")) {
      const s = Buffer.from(header.slice(6), "base64").toString("utf8"),
        at = s.indexOf(":");
      if (at < 0) return undefined;
      try {
        id = decodeURIComponent(s.slice(0, at));
        sec = decodeURIComponent(s.slice(at + 1));
      } catch {
        return undefined;
      }
      method = "client_secret_basic";
    }
    if (typeof id !== "string") return undefined;
    const c = store.get("client", id);
    if (!c || c.token_endpoint_auth_method !== method) return undefined;
    if (
      method !== "none" &&
      (typeof sec !== "string" || !same(c.secretHash, digest(sec)))
    )
      return undefined;
    return c;
  }
  function issueTokens(p, family = secret()) {
    const access = secret(),
      refresh = secret(),
      base = {
        userId: p.userId,
        clientId: p.clientId,
        resource: cfg.resource,
        scope,
        family,
      };
    store.put(
      "access",
      digest(access),
      { ...base, expiresAt: now() + 3600 },
      3600,
    );
    store.put("refresh", digest(refresh), base, 30 * 86400);
    return {
      access_token: access,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refresh,
      scope,
    };
  }
  app.post("/oauth/token", (req, res) => {
    const c = clientFrom(req);
    if (!c)
      return fail(
        res,
        "invalid_client",
        "클라이언트 인증에 실패했습니다.",
        401,
      );
    if (req.body.resource && req.body.resource !== cfg.resource)
      return fail(res, "invalid_target", "리소스가 일치하지 않습니다.");
    if (req.body.grant_type === "authorization_code") {
      const code = String(req.body.code || ""),
        p = store.get("code", digest(code));
      if (
        !p ||
        p.clientId !== c.client_id ||
        p.redirectUri !== req.body.redirect_uri
      )
        return fail(
          res,
          "invalid_grant",
          "코드가 만료되었거나 요청과 일치하지 않습니다.",
        );
      const v = req.body.code_verifier;
      if (
        typeof v !== "string" ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(v) ||
        !same(p.challenge, createHash("sha256").update(v).digest("base64url"))
      )
        return fail(res, "invalid_grant", "PKCE 검증에 실패했습니다.");
      store.remove("code", digest(code));
      return res.json(issueTokens(p));
    }
    if (req.body.grant_type === "refresh_token") {
      const key = digest(String(req.body.refresh_token || "")),
        p = store.get("refresh", key),
        used = store.get("used-refresh", key);
      if (used && used.clientId === c.client_id)
        store.put("revoked-family", used.family, true, 31 * 86400);
      if (
        !p ||
        p.clientId !== c.client_id ||
        store.get("revoked-family", p.family)
      )
        return fail(
          res,
          "invalid_grant",
          "갱신 토큰이 만료되었거나 폐기되었습니다.",
        );
      if (req.body.scope && req.body.scope !== scope)
        return fail(res, "invalid_scope", "범위를 확대할 수 없습니다.");
      store.remove("refresh", key);
      store.put("used-refresh", key, p, 31 * 86400);
      return res.json(issueTokens(p, p.family));
    }
    return fail(
      res,
      "unsupported_grant_type",
      "지원하지 않는 grant_type입니다.",
    );
  });
  app.post("/oauth/revoke", (req, res) => {
    const c = clientFrom(req);
    if (!c)
      return fail(
        res,
        "invalid_client",
        "클라이언트 인증에 실패했습니다.",
        401,
      );
    const key = digest(String(req.body.token || ""));
    const p =
      store.get("access", key) ||
      store.get("refresh", key) ||
      store.get("used-refresh", key);
    if (p?.clientId === c.client_id)
      store.put("revoked-family", p.family, true, 31 * 86400);
    res.sendStatus(200);
  });
  const requireMcp = (req, res, next) => {
    const header = req.get("authorization");
    const token = header?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
    const p = token ? store.get("access", digest(token)) : undefined;
    if (
      !p ||
      p.resource !== cfg.resource ||
      p.scope !== scope ||
      (cfg.allowedGithubIds.length &&
        !cfg.allowedGithubIds.includes(p.userId)) ||
      store.get("revoked-family", p.family)
    ) {
      res.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${cfg.baseUrl}/.well-known/oauth-protected-resource/mcp", scope="${scope}"`,
      );
      return fail(
        res,
        "invalid_token",
        "이 MCP에 대한 연결 승인이 필요합니다.",
        401,
      );
    }
    req.mcpUserId = p.userId;
    next();
  };
  return { requireUser, csrf, requireMcp, issueTokens };
}
