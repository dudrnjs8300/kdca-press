"""Private Python Durable Object: unchanged shared HWPX core, no stored documents."""
import json
from pathlib import Path
from urllib.parse import urlparse
from workers import DurableObject, Response, WorkerEntrypoint
import kdca_core
from bundled_assets import ASSETS

# Deploy-time Python memory snapshots do not guarantee that temporary files
# written during import survive restoration. Materialize bundled assets when
# handling the request; never cache an "initialized" flag in Python memory.
ROOT = Path("/tmp/kdca-press-assets")


def ensure_assets():
    for name, content in ASSETS.items():
        target = ROOT / name
        if not target.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
    kdca_core.ROOT = ROOT


class PressEngine(DurableObject):
    async def fetch(self, request):
        action = urlparse(request.url).path.removeprefix("/")
        if request.method != "POST" or action not in ("prepare", "review", "generate"):
            return Response.json({"error": "not_found"}, status=404)
        raw = await request.text()
        if len(raw.encode("utf-8")) > 262144:
            return Response.json({"error": "payload_too_large"}, status=413)
        try:
            ensure_assets()
            result = kdca_core.process(json.loads(raw), action)
            return Response.json(result)
        except (ValueError, KeyError, TypeError) as exc:
            return Response.json({"error": str(exc)}, status=400)
        except OSError:
            return Response.json({"error": "문서 생성기의 양식 파일을 읽을 수 없습니다.", "code": "ENGINE_ASSET_IO"}, status=503)


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        # No public workers.dev route; caller is the authenticated MCP adapter.
        return await self.env.ENGINE.getByName("generator").fetch(request)
