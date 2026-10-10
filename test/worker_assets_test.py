"""Exercise cold-restored Python state with an empty temporary filesystem."""
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class WorkerAssetsTest(unittest.TestCase):
    def test_restored_module_can_prepare_and_generate_without_import_time_files(self):
        core = load("core", ROOT / "packages/kdca-press/scripts/kdca_press.py")
        assets = {name: (ROOT / "packages/kdca-press" / name).read_text(encoding="utf-8")
                  for name in ("assets/template.json", "references/editorial.md")}
        workers = types.SimpleNamespace(DurableObject=object, Response=object, WorkerEntrypoint=object)
        with patch.dict(sys.modules, {"workers": workers, "kdca_core": core,
                                    "bundled_assets": types.SimpleNamespace(ASSETS=assets)}):
            entry = load("engine", ROOT / "workers/engine/src/entry.py")
            with tempfile.TemporaryDirectory() as directory:
                entry.ROOT = Path(directory) / "assets"
                data = json.loads((ROOT / "examples/symposium.json").read_text(encoding="utf-8"))
                for _ in range(2):
                    self.assertFalse(entry.ROOT.exists())
                    entry.ensure_assets()
                    self.assertEqual(core.process(data, "prepare")["guide"], assets["references/editorial.md"])
                    self.assertTrue(core.process(data, "generate")["ok"])
                    shutil.rmtree(entry.ROOT)


if __name__ == "__main__":
    unittest.main()
