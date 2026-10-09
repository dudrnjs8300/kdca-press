import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { secret, digest, now } from './store.js';

// Only authentication state belongs on disk. Documents have no storage API here.
const namespaces = new Set(['session', 'github', 'client', 'authorization', 'code',
  'access', 'refresh', 'used-refresh', 'revoked-family']);
export class AuthStore {
  constructor(dir = ':memory:') {
    this.persistent = dir !== ':memory:';
    if (this.persistent) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      chmodSync(dir, 0o700);
    }
    const filename = this.persistent ? path.join(dir, 'auth.sqlite') : ':memory:';
    this.db = new DatabaseSync(filename);
    if (this.persistent) chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, login TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS kv(ns TEXT NOT NULL,k TEXT NOT NULL,v TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(ns,k));
      CREATE INDEX IF NOT EXISTS kv_expiry ON kv(expires);`);
    this.cleanup();
  }
  user(id, login) {
    this.db.prepare('INSERT INTO users VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login')
      .run(String(id), login, now());
    return { id: String(id), login };
  }
  put(ns, key, value, ttl = 600) {
    if (!namespaces.has(ns)) throw new Error('Unsupported authentication namespace');
    this.db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?,?,?)')
      .run(ns, key, JSON.stringify(value), now() + ttl);
  }
  get(ns, key) {
    const row = this.db.prepare('SELECT v FROM kv WHERE ns=? AND k=? AND expires>?').get(ns, key, now());
    return row ? JSON.parse(row.v) : undefined;
  }
  remove(ns, key) { this.db.prepare('DELETE FROM kv WHERE ns=? AND k=?').run(ns, key); }
  count(ns) { return this.db.prepare('SELECT count(*) AS n FROM kv WHERE ns=? AND expires>?').get(ns, now()).n; }
  session(user) {
    const token = secret();
    this.put('session', digest(token), { user, csrf: secret() }, 7 * 86400);
    return token;
  }
  cleanup() { this.db.prepare('DELETE FROM kv WHERE expires<=?').run(now()); }
  close() { this.db.close(); }
}
