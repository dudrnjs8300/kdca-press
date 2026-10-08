import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { Store } from "./store.js";
import { installAuth } from "./auth.js";
import { PressService, problem } from "./service.js";
import { mountMcp } from "./mcp.js";
import { draftSchema } from "./editorial.js";

export function createApp(
  cfg,
  { store = new Store(cfg.dataDir), renderer } = {},
) {
  const app = express(),
    service = new PressService(store, cfg, renderer);
  app.disable("x-powered-by");
  app.set("trust proxy", cfg.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: cfg.local ? null : [],
        },
      },
    }),
  );
  // Metadata and token endpoints must be accessible to browser-based OAuth clients.
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/.well-known/") ||
      ["/oauth/register", "/oauth/token", "/oauth/revoke", "/mcp"].includes(
        req.path,
      )
    ) {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Accept, MCP-Protocol-Version, Last-Event-ID",
      );
      res.set(
        "Access-Control-Expose-Headers",
        "WWW-Authenticate, MCP-Protocol-Version",
      );
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    if (req.path === "/mcp" && req.get("origin")) {
      const origin = req.get("origin");
      const allowed = [
        cfg.baseUrl,
        "https://chatgpt.com",
        "https://claude.ai",
        "https://gemini.google.com",
      ];
      if (!allowed.includes(origin))
        return res.status(403).json({ error: "invalid_origin" });
    }
    if (req.path.startsWith("/api/"))
      res.set("Cache-Control", "private, no-store");
    next();
  });
  app.use(
    express.json({ limit: "192kb" }),
    express.urlencoded({ extended: false, limit: "16kb" }),
    cookieParser(),
  );
  const auth = installAuth(app, store, cfg);
  app.use(
    ["/mcp", "/api"],
    rateLimit({
      windowMs: 60000,
      limit: 80,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.get("/healthz", (req, res) => {
    store.db.prepare("SELECT 1").get();
    res.json({ status: "ok", service: "kdca-press-mcp", version: "0.1.1" });
  });
  app.get("/api/session", (req, res) =>
    res.json({
      user: req.user || null,
      csrf: req.session?.csrf || null,
      demo: cfg.demo,
      mcpUrl: cfg.resource,
      maximumSource: cfg.maxSourceChars,
    }),
  );
  app.get("/api/examples/:kind", async (req, res) => {
    if (!["symposium", "statistics", "program"].includes(req.params.kind))
      return res.sendStatus(404);
    const e = JSON.parse(
      await readFile(
        new URL(`../examples/${req.params.kind}.json`, import.meta.url),
        "utf8",
      ),
    );
    res.json(e);
  });
  app.use("/api", auth.requireUser);
  app.get("/api/documents", (req, res) =>
    res.json({ documents: store.list(req.user.id) }),
  );
  app.post("/api/briefs", auth.csrf, (req, res) =>
    res.status(201).json(service.prepare(req.user.id, req.body)),
  );
  app.post("/api/review", auth.csrf, (req, res) =>
    res.json(service.review(req.user.id, req.body.brief_id, req.body.draft)),
  );
  app.post("/api/documents", auth.csrf, async (req, res) =>
    res
      .status(201)
      .json(
        await service.create(req.user.id, req.body.brief_id, req.body.draft),
      ),
  );
  app.get("/api/documents/:id", (req, res) => {
    const d = service.describe(req.user.id, req.params.id);
    res.json({ ...d, source: service.brief(req.user.id, d.brief_id).source });
  });
  app.put("/api/documents/:id", auth.csrf, async (req, res) => {
    const b = z
        .object({ revision: z.number().int().positive(), draft: draftSchema })
        .strict()
        .parse(req.body),
      old = service.get(req.user.id, req.params.id);
    if (old.revision !== b.revision)
      throw problem(
        "다른 수정본이 저장됐습니다. 문서를 새로 열어 주세요.",
        409,
      );
    res.json(
      await service.create(req.user.id, old.brief_id, b.draft, {
        id: old.id,
        revision: b.revision,
      }),
    );
  });
  app.delete("/api/documents/:id", auth.csrf, (req, res) => {
    if (!store.deleteDocument(req.params.id, req.user.id))
      throw problem("문서를 찾을 수 없습니다.", 404);
    res.json({ ok: true });
  });
  app.get("/api/documents/:id/download", (req, res) => {
    const d = service.get(req.user.id, req.params.id);
    res.set(
      "Content-Disposition",
      `attachment; filename="press-release.hwpx"; filename*=UTF-8''${encodeURIComponent(d.title.slice(0, 60) + ".hwpx")}`,
    );
    res.type("application/hwp+zip").send(d.hwpx);
  });
  app.get("/api/documents/:id/preview", (req, res) => {
    const d = service.get(req.user.id, req.params.id);
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    );
    res.type("image/svg+xml").send(d.previews.svg);
  });
  app.post("/api/connections/revoke", auth.csrf, (req, res) => {
    // Revoke all current MCP sessions for this owner without affecting other users.
    for (const row of store.db
      .prepare(
        "SELECT ns,k,v FROM kv WHERE ns IN ('access','refresh','used-refresh')",
      )
      .all()) {
      const p = JSON.parse(row.v);
      if (p.userId === req.user.id)
        store.put("revoked-family", p.family, true, 31 * 86400);
    }
    res.json({ ok: true });
  });
  mountMcp(app, auth, service);
  app.use(
    express.static(fileURLToPath(new URL("../public/", import.meta.url)), {
      etag: true,
      maxAge: 0,
    }),
  );
  app.use((req, res) => res.status(404).json({ error: "not_found" }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status = err instanceof z.ZodError ? 400 : err.status || 500;
    // Never log source text, auth codes, cookies, access tokens, or request URLs.
    if (status >= 500)
      console.error(
        JSON.stringify({ event: "request_failed", type: err.name || "Error" }),
      );
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "문서 처리에 실패했습니다. 잠시 후 다시 시도해 주세요."
            : err.message,
        ...(err.review ? { review: err.review } : {}),
        ...(err instanceof z.ZodError
          ? {
              issues: err.issues.map((i) => ({
                path: i.path,
                message: i.message,
              })),
            }
          : {}),
      });
  });
  return { app, store, service, auth };
}
