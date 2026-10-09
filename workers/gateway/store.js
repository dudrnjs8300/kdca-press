import { secret, digest, now } from '../../src/security.js';
import { Artifacts } from '../../src/artifacts.js';

// The default Express rate-limit store starts an interval. This SQL store has
// no timer, so an idle Durable Object remains eligible for hibernation.
export class WorkerRateStore {
  constructor(sql,prefix) {this.sql=sql;this.prefix=prefix;this.localKeys=false;
    sql.exec('CREATE TABLE IF NOT EXISTS rate_limits(bucket TEXT NOT NULL,k TEXT NOT NULL,hits INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(bucket,k))');
    sql.exec('CREATE INDEX IF NOT EXISTS rate_expiry ON rate_limits(expires)');}
  init(options) {this.windowMs=options.windowMs;}
  async increment(key) {
    key=typeof key==='string'&&key?key:'shared-no-client-ip';
    const time=Date.now(),expiry=time+this.windowMs;
    this.sql.exec('INSERT INTO rate_limits VALUES(?,?,1,?) ON CONFLICT(bucket,k) DO UPDATE SET hits=CASE WHEN expires<=? THEN 1 ELSE hits+1 END,expires=CASE WHEN expires<=? THEN ? ELSE expires END',this.prefix,key,expiry,time,time,expiry);
    const row=this.sql.exec('SELECT hits,expires FROM rate_limits WHERE bucket=? AND k=?',this.prefix,key).one();
    return {totalHits:row.hits,resetTime:new Date(row.expires)};
  }
  async decrement(key) {this.sql.exec('UPDATE rate_limits SET hits=max(0,hits-1) WHERE bucket=? AND k=?',this.prefix,key||'shared-no-client-ip');}
  async resetKey(key) {this.sql.exec('DELETE FROM rate_limits WHERE bucket=? AND k=?',this.prefix,key||'shared-no-client-ip');}
}

const namespaces = new Set(['session','github','client','authorization','code','access','refresh','used-refresh','revoked-family']);
export class WorkerAuthStore {
  constructor(sql) {
    this.sql=sql; this.persistent=true;
    sql.exec('CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, login TEXT NOT NULL, created INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS auth(ns TEXT NOT NULL,k TEXT NOT NULL,v TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(ns,k))');
    sql.exec('CREATE INDEX IF NOT EXISTS auth_expiry ON auth(expires)');
  }
  user(id,login) {this.sql.exec('INSERT INTO users VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login',String(id),login,now());return {id:String(id),login};}
  put(ns,k,v,ttl=600) {if(!namespaces.has(ns))throw new Error('Invalid auth namespace');this.sql.exec('INSERT OR REPLACE INTO auth VALUES(?,?,?,?)',ns,k,JSON.stringify(v),now()+ttl);}
  get(ns,k) {const row=this.sql.exec('SELECT v FROM auth WHERE ns=? AND k=? AND expires>?',ns,k,now()).toArray()[0];return row?JSON.parse(row.v):undefined;}
  remove(ns,k) {this.sql.exec('DELETE FROM auth WHERE ns=? AND k=?',ns,k);}
  count(ns) {return this.sql.exec('SELECT count(*) AS n FROM auth WHERE ns=? AND expires>?',ns,now()).one().n;}
  session(user) {const token=secret();this.put('session',digest(token),{user,csrf:secret()},7*86400);return token;}
  cleanup() {this.sql.exec('DELETE FROM auth WHERE expires<=?',now());}
  close() {}
}

// Temporary files survive isolate eviction. SQL expiry is checked on EVERY read;
// the alarm removes expired rows even when nobody requests a file again.
export class WorkerArtifacts extends Artifacts {
  constructor(sql) {
    super({maxBytes:16_000_000}); this.sql=sql;
    sql.exec('CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,v TEXT NOT NULL,expires INTEGER NOT NULL)');
    sql.exec('CREATE INDEX IF NOT EXISTS artifact_expiry ON artifacts(expires)');
    sql.exec('DELETE FROM artifacts WHERE expires<=?',this.clock());
    for(const row of sql.exec('SELECT v FROM artifacts').toArray()) {
      const item=JSON.parse(row.v);
      item.tokenHash=Buffer.from(item.tokenHash,'base64');
      item.files=Object.fromEntries(Object.entries(item.files).map(([k,v])=>[k,Buffer.from(v,'base64')]));
      this.items.set(item.id,item);
    }
  }
  cleanup() {super.cleanup();this.sql?.exec('DELETE FROM artifacts WHERE expires<=?',this.clock());}
  put(...args) {
    const result=super.put(...args),item=result.item;
    const v=JSON.stringify({...item,tokenHash:item.tokenHash.toString('base64'),files:Object.fromEntries(Object.entries(item.files).map(([k,v])=>[k,v.toString('base64')]))});
    try {this.sql.exec('INSERT INTO artifacts VALUES(?,?,?)',item.id,v,item.expires);}
    catch(e){this.items.delete(item.id);throw e;}
    return result;
  }
}
