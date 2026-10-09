#!/usr/bin/env python3
"""Copy the canonical distribution core byte-for-byte; bundle its static assets."""
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent
source = ROOT / "packages/kdca-press"
dest = ROOT / "workers/engine/src"
shutil.copyfile(source / "scripts/kdca_press.py", dest / "kdca_core.py")
assets = {name: (source / name).read_text(encoding="utf-8") for name in
          ("assets/template.json", "references/editorial.md")}
(dest / "bundled_assets.py").write_text("# Generated; do not edit.\nASSETS = " + repr(assets) + "\n", encoding="utf-8")
print("Workers engine prepared from the unchanged Skill core.")
