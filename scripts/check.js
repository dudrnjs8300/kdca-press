import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const dir of ["src", "public", "web", "scripts", "test", "workers/gateway"])
  for (const file of await readdir(dir)) {
    if (!file.endsWith(".js") && !file.endsWith(".mjs")) continue;
    const result = spawnSync(process.execPath, ["--check", `${dir}/${file}`], {
      stdio: "inherit",
    });
    if (result.status) process.exit(result.status);
  }
console.log("JavaScript syntax checked.");

for (const file of await readdir('scripts/pc')) {
  if (file.endsWith('.py')) {
    const py = spawnSync(process.env.PYTHON_BIN || 'python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', `scripts/pc/${file}`], {stdio:'inherit'});
    if (py.status) process.exit(py.status);
  }
  if (!file.endsWith('.sh')) continue;
  const result = spawnSync('bash', ['-n', `scripts/pc/${file}`], {stdio:'inherit'});
  if (result.status) process.exit(result.status);
}
console.log('WSL shell syntax checked.');
