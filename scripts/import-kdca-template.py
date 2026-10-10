#!/usr/bin/env python3
"""Import the supplied 2026-10-08 KDCA layout, retaining its four brand images.

Usage: python3 scripts/import-kdca-template.py reference.hwpx
Only layout and brand assets are retained; publication-specific text is removed.
"""
import base64
import hashlib
import json
from pathlib import Path
import sys
from xml.dom import minidom
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def import_template(path):
    with zipfile.ZipFile(path) as z:
        entries = {n: z.read(n) for n in z.namelist()}
    doc = minidom.parseString(entries['Contents/section0.xml'])
    root = doc.documentElement
    blocks = [n for n in root.childNodes if n.nodeType == n.ELEMENT_NODE]
    # Header, release timing, spacer, title/footer, spacer, and a blank contact row.
    keep = blocks[:5] + [blocks[32]]
    for n in list(root.childNodes):
        if n not in keep:
            root.removeChild(n)
    for i, block in enumerate(keep):
        if i == 0:
            continue
        for t in block.getElementsByTagName('hp:t'):
            if i == 1 and t.firstChild and t.firstChild.data in ('보도시점', '배포'):
                continue
            for c in list(t.childNodes):
                t.removeChild(c)
    for tag in ('hp:linesegarray', 'hp:fieldBegin', 'hp:fieldEnd'):
        for n in list(root.getElementsByTagName(tag)):
            if tag == 'hp:linesegarray':
                # Preserve fixed artwork/footer positioning; variable cells are rebuilt.
                continue
            n.parentNode.removeChild(n)
    entries['Contents/section0.xml'] = doc.toxml(encoding='utf-8')
    allowed_images = {f'BinData/image{i}.{ext}' for i, ext in ((1,'jpg'),(2,'png'),(3,'png'),(4,'jpg'))}
    entries = {n:b for n,b in entries.items() if not n.startswith(('BinData/', 'Preview/')) or n in allowed_images}
    entries['Preview/PrvText.txt'] = '보도자료'.encode()
    manifest = minidom.parseString(entries['Contents/content.hpf'])
    for n in list(manifest.getElementsByTagName('*')):
        if n.localName == 'item' and n.getAttribute('href').startswith('BinData/') and n.getAttribute('href') not in allowed_images:
            n.parentNode.removeChild(n)
        if n.localName in ('title','creator','subject','description','date','meta'):
            for child in list(n.childNodes):
                n.removeChild(child)
    entries['Contents/content.hpf'] = manifest.toxml(encoding='utf-8')
    # Editor cursor state has no purpose in a reusable template.
    settings = minidom.parseString(entries['settings.xml'])
    for n in settings.getElementsByTagName('*'):
        if n.localName == 'CursorPosition':
            for attr in ('listIDRef','paraIDRef','pos'):
                if n.hasAttribute(attr): n.setAttribute(attr,'0')
    entries['settings.xml'] = settings.toxml(encoding='utf-8')
    bundle = {n: {'base64':base64.b64encode(b).decode()} if n in allowed_images else b.decode('utf-8') for n,b in entries.items()}
    (ROOT/'packages/kdca-press/assets/template.json').write_text(json.dumps(bundle,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    with zipfile.ZipFile(ROOT/'templates/kdca-press.hwpx','w') as z:
        for name in ['mimetype',*sorted(n for n in entries if n!='mimetype')]:
            info=zipfile.ZipInfo(name,date_time=(2026,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_STORED if name=='mimetype' else zipfile.ZIP_DEFLATED
            z.writestr(info,entries[name])
    print(json.dumps({'source_sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'images':{n:hashlib.sha256(entries[n]).hexdigest() for n in sorted(allowed_images)}},indent=2))


if __name__ == '__main__':
    import_template(sys.argv[1])
