import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";

export const secret = () => randomBytes(32).toString("base64url");
export const digest = (s) => createHash("sha256").update(s).digest("hex");
export const now = () => Math.floor(Date.now() / 1000);
export class Store {
  constructor(dir) {
    if (dir !== ":memory:") mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(
      dir === ":memory:" ? dir : path.join(dir, "pressroom.sqlite"),
    );
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, login TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS kv(ns TEXT NOT NULL,k TEXT NOT NULL,v TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(ns,k));
      CREATE INDEX IF NOT EXISTS kv_expiry ON kv(expires);
      CREATE TABLE IF NOT EXISTS briefs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),source TEXT NOT NULL,kind TEXT NOT NULL,created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS brief_owner ON briefs(user_id,created);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),brief_id TEXT NOT NULL REFERENCES briefs(id),title TEXT NOT NULL,draft TEXT NOT NULL,review TEXT NOT NULL,hwpx BLOB NOT NULL,previews TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created INTEGER NOT NULL,updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS document_owner ON documents(user_id,updated);`);
  }
  user(id, login) {
    this.db
      .prepare(
        "INSERT INTO users VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login",
      )
      .run(String(id), login, now());
    return { id: String(id), login };
  }
  put(ns, key, value, ttl = 600) {
    this.db
      .prepare("INSERT OR REPLACE INTO kv VALUES(?,?,?,?)")
      .run(ns, key, JSON.stringify(value), now() + ttl);
  }
  get(ns, key) {
    const row = this.db
      .prepare("SELECT v FROM kv WHERE ns=? AND k=? AND expires>?")
      .get(ns, key, now());
    return row ? JSON.parse(row.v) : undefined;
  }
  remove(ns, key) {
    this.db.prepare("DELETE FROM kv WHERE ns=? AND k=?").run(ns, key);
  }
  count(ns) {
    return this.db
      .prepare("SELECT count(*) AS n FROM kv WHERE ns=? AND expires>?")
      .get(ns, now()).n;
  }
  session(user) {
    const token = secret();
    this.put("session", digest(token), { user, csrf: secret() }, 86400 * 7);
    return token;
  }
  addBrief(userId, source, kind) {
    const count = this.db
      .prepare("SELECT count(*) AS n FROM briefs WHERE user_id=? AND created>?")
      .get(userId, now() - 86400).n;
    if (count >= 100)
      throw Object.assign(
        new Error("하루 원문 등록 한도(100건)를 초과했습니다."),
        { status: 429 },
      );
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO briefs VALUES(?,?,?,?,?)")
      .run(id, userId, source, kind, now());
    return { id, userId, source, kind };
  }
  brief(id, userId) {
    const r = this.db
      .prepare("SELECT * FROM briefs WHERE id=? AND user_id=?")
      .get(id, userId);
    return r && { id: r.id, source: r.source, kind: r.kind, userId: r.user_id };
  }
  list(userId) {
    return this.db
      .prepare(
        "SELECT id,title,revision,created,updated FROM documents WHERE user_id=? ORDER BY updated DESC LIMIT 1000",
      )
      .all(userId);
  }
  document(id, userId) {
    const r = this.db
      .prepare("SELECT * FROM documents WHERE id=? AND user_id=?")
      .get(id, userId);
    return (
      r && {
        ...r,
        draft: JSON.parse(r.draft),
        review: JSON.parse(r.review),
        previews: JSON.parse(r.previews),
        hwpx: Buffer.from(r.hwpx),
      }
    );
  }
  save(userId, briefId, draft, review, result, maximum, update) {
    const timestamp = now();
    if (update) {
      const change = this.db
        .prepare(
          "UPDATE documents SET title=?,draft=?,review=?,hwpx=?,previews=?,revision=revision+1,updated=? WHERE id=? AND user_id=? AND revision=?",
        )
        .run(
          draft.title,
          JSON.stringify(draft),
          JSON.stringify(review),
          result.hwpx,
          JSON.stringify(result.previews),
          timestamp,
          update.id,
          userId,
          update.revision,
        );
      if (!change.changes)
        throw Object.assign(
          new Error("다른 수정본이 저장됐습니다. 문서를 새로 열어 주세요."),
          { status: 409 },
        );
      return update.id;
    }
    if (this.list(userId).length >= maximum)
      throw Object.assign(
        new Error(
          "문서함 한도에 도달했습니다. 사용하지 않는 문서를 삭제해 주세요.",
        ),
        { status: 409 },
      );
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        userId,
        briefId,
        draft.title,
        JSON.stringify(draft),
        JSON.stringify(review),
        result.hwpx,
        JSON.stringify(result.previews),
        1,
        timestamp,
        timestamp,
      );
    return id;
  }
  deleteDocument(id, userId) {
    const doc = this.document(id, userId);
    if (!doc) return false;
    this.db
      .prepare("DELETE FROM documents WHERE id=? AND user_id=?")
      .run(id, userId);
    this.db
      .prepare(
        "DELETE FROM briefs WHERE id=? AND user_id=? AND id NOT IN(SELECT brief_id FROM documents)",
      )
      .run(doc.brief_id, userId);
    return true;
  }
  cleanup() {
    this.db.prepare("DELETE FROM kv WHERE expires<=?").run(now());
    this.db
      .prepare(
        "DELETE FROM briefs WHERE created<? AND id NOT IN(SELECT brief_id FROM documents)",
      )
      .run(now() - 7 * 86400);
  }
  close() {
    this.db.close();
  }
}
