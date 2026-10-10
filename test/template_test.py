"""Regression for the real KDCA template: artwork, type, footer and clean content."""
import base64
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from xml.dom import minidom
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('core', ROOT/'packages/kdca-press/scripts/kdca_press.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)
IMAGE_HASHES = {
    'BinData/image1.jpg':'e3372cba9dde7d0089c5c2c33ec6301a59639bfac7b99bfe36ddfdd4348fc517',
    'BinData/image2.png':'a2aaf7dd3f18badd725fd8463977cf1e8c5fa055426112771ae6d800fe20d309',
    'BinData/image3.png':'f4de7f3c8d5e1389b53b8d69ca1979150a5d56fa36543b83894a9b95643f17ad',
    'BinData/image4.jpg':'0613e73406ce642c1ccc50384aedb8fab969ab4fd0da5ab2a5d60f16322ea1e5',
}


class TemplateTests(unittest.TestCase):
    def test_published_template_contains_only_fixed_labels(self):
        bundle=json.loads((ROOT/'packages/kdca-press/assets/template.json').read_text())
        doc=minidom.parseString(bundle['Contents/section0.xml'])
        text=[''.join(c.data for c in n.childNodes if c.nodeType==c.TEXT_NODE) for n in doc.getElementsByTagName('hp:t')]
        self.assertEqual([t for t in text if t.strip()],['보도자료','보도시점','배포'])
        self.assertEqual(bundle['Preview/PrvText.txt'],'보도자료')
        self.assertEqual(set(n for n,v in bundle.items() if isinstance(v,dict)),set(IMAGE_HASHES))
        for name,data in bundle.items():
            if isinstance(data,dict): continue
            self.assertNotRegex(data,r'\b(?:0\d{1,2})-\d{3,4}-\d{4}\b')
            self.assertNotRegex(data,r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}')
        manifest=minidom.parseString(bundle['Contents/content.hpf'])
        for n in manifest.getElementsByTagName('*'):
            if n.localName in ('title','meta'):
                self.assertFalse(n.childNodes)

    def test_reference_artwork_styles_footer_and_no_injected_messages(self):
        for kind in ('symposium','statistics','program'):
            with self.subTest(kind=kind):
                payload=json.loads((ROOT/f'examples/{kind}.json').read_text())
                payload['draft']['metadata']={}
                made=core.process(payload,'generate')
                self.assertTrue(made['ok'])
                with zipfile.ZipFile(io.BytesIO(base64.b64decode(made['hwpxBase64']))) as z:
                    self.assertEqual(set(n for n in z.namelist() if n.startswith('BinData/')),set(IMAGE_HASHES))
                    for name,digest in IMAGE_HASHES.items():
                        self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(),digest)
                    self.assertEqual(hashlib.sha256(z.read('Contents/header.xml')).hexdigest(),'e0d8c326699f1b9f1cb35bddfc0b2a3ef36a40a750fa82440d2127eac1f21c7f')
                    xml=z.read('Contents/section0.xml').decode()
                    doc=minidom.parseString(xml)
                    self.assertIn('charPrIDRef="66"',xml)  # original 26pt HCR Dotum
                    self.assertIn('charPrIDRef="81"',xml)  # original 14pt HCR Batang
                    self.assertIn('charPrIDRef="89"',xml)  # original 14pt Batang
                    footer=doc.getElementsByTagName('hp:footer')[0]
                    self.assertEqual(footer.getAttribute('applyPageType'),'BOTH')
                    self.assertEqual([n.getAttribute('binaryItemIDRef') for n in footer.getElementsByTagName('hc:img')],['image3','image4'])
                    self.assertEqual(doc.getElementsByTagName('hp:pageNum')[0].getAttribute('pos'),'BOTTOM_CENTER')
                    margin=doc.getElementsByTagName('hp:pagePr')[0].getElementsByTagName('hp:margin')[0]
                    self.assertEqual((margin.getAttribute('left'),margin.getAttribute('top')),('5669','4251'))
                    for forbidden in ('기능 검증용','가상 자료로 만든','보도자료 초안','참고 양식','검토 후 배포','AI 작성 보조','확인 필요','임주현','윤단규','임신당뇨병','2026. 10. 07.'):
                        self.assertNotIn(forbidden,xml)
                    self.assertNotIn('Preview/PrvImage.png',z.namelist())

    def test_missing_artwork_is_a_generation_error(self):
        payload=json.loads((ROOT/'examples/symposium.json').read_text())
        made=core.process(payload,'generate')
        stream=io.BytesIO()
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(made['hwpxBase64']))) as source, zipfile.ZipFile(stream,'w') as target:
            for item in source.infolist():
                if item.filename!='BinData/image3.png': target.writestr(item,source.read(item.filename))
        with self.assertRaisesRegex(core.InputError,'이미지'):
            core.validate_hwpx(stream.getvalue())


if __name__ == '__main__':
    unittest.main()
