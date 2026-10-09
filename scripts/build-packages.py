#!/usr/bin/env python3
"""Build reproducible offline skill and repository release packages."""
import hashlib
import json
import shutil
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "dist"
DEST.mkdir(exist_ok=True)
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
skill = ROOT / "packages/kdca-press"
files = [p for p in skill.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"]
for p in files:
    p.read_text(encoding="utf-8")
assert (skill / "SKILL.md").is_file()


def package(name, items):
    target = DEST / name
    with zipfile.ZipFile(target, "w") as z:
        for archive, data in sorted(items):
            i = zipfile.ZipInfo(archive, (2026, 1, 1, 0, 0, 0))
            i.compress_type = zipfile.ZIP_DEFLATED
            i.external_attr = 0o644 << 16
            z.writestr(i, data)
    return target


package("kdca-press-skill.zip", [("kdca-press/" + p.relative_to(skill).as_posix(), p.read_bytes()) for p in files])
package("kdca-press-gemini.zip", [(p.relative_to(skill).as_posix(), p.read_bytes()) for p in files])
manifest = {"$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "name": "kdca-press", "version": VERSION, "description": "질병관리청 보도자료 작성·퇴고 및 오프라인 HWPX 생성"}
plugin_items = [("kdca-press/plugin.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode())]
plugin_items += [("kdca-press/skills/kdca-press/" + p.relative_to(skill).as_posix(), p.read_bytes()) for p in files]
package("kdca-press-plugin.zip", plugin_items)

allowed_roots = {"src", "packages", "scripts", "test", "examples", "templates", "web", "public", "docs", "evals", ".github"}
allowed_files = {"README.md", "LICENSE", "THIRD_PARTY.md", "package.json", "package-lock.json", "Dockerfile", "render.yaml", ".dockerignore", ".gitignore", ".env.example"}
source = []
for p in ROOT.rglob("*"):
    rel = p.relative_to(ROOT)
    if not p.is_file() or not (rel.parts[0] in allowed_roots or rel.as_posix() in allowed_files): continue
    if "__pycache__" in rel.parts or p.suffix in (".pyc", ".log") or "node_modules" in rel.parts: continue
    if rel.parts[:2] == ("web", "downloads"): continue
    if p.name.startswith(".env") and p.name != ".env.example": continue
    source.append((f"kdca-press-{VERSION}/" + rel.as_posix(), p.read_bytes()))
package(f"kdca-press-{VERSION}-source.zip", source)
current_packages = [DEST/name for name in ("kdca-press-skill.zip", "kdca-press-gemini.zip", "kdca-press-plugin.zip", f"kdca-press-{VERSION}-source.zip")]
checksums = "\n".join(hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name for p in sorted(current_packages)) + "\n"
(DEST / "SHA256SUMS.txt").write_text(checksums)
downloads = ROOT / "web/downloads"
downloads.mkdir(exist_ok=True)
for name in ("kdca-press-skill.zip", "kdca-press-gemini.zip", "kdca-press-plugin.zip", "SHA256SUMS.txt"):
    shutil.copyfile(DEST / name, downloads / name)
print(json.dumps({"version": VERSION, "files": [{"name": p.name, "bytes": p.stat().st_size} for p in sorted(DEST.iterdir())]}, ensure_ascii=False))
