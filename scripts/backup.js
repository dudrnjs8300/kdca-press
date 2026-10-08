import { DatabaseSync, backup } from "node:sqlite";
import { resolve, dirname } from "node:path";
import { mkdirSync, chmodSync } from "node:fs";
const source = resolve(process.env.DATA_DIR || "data", "pressroom.sqlite");
const target = process.argv[2];
if (!target || resolve(target) === source)
  throw new Error(
    "Usage: node scripts/backup.js /private-backups/pressroom-DATE.sqlite",
  );
mkdirSync(dirname(resolve(target)), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, resolve(target));
  chmodSync(target, 0o600);
} finally {
  db.close();
}
console.log(
  "Consistent SQLite backup completed. Store it privately; it contains document and auth data.",
);
