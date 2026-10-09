import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('pc_configure', Path(__file__).resolve().parents[1]/'scripts/pc/configure.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)

class SetupTest(unittest.TestCase):
    def test_generated_config_keeps_secrets_out_of_units_and_preserves_values(self):
        with tempfile.TemporaryDirectory(prefix='kdca-setup-') as folder:
            root = Path(folder)
            config = root/'config'
            config.mkdir()
            node = shutil.which('node')
            (config/'runtime.json').write_text(json.dumps({'node':node,'python':'/usr/bin/python3'}))
            client_secret = 'test-secret-$value-"quote"-back\\slash'
            token = 'e'*80
            with patch.object(setup, 'ROOT', root), patch.object(setup, 'CONFIG', config), \
                 patch.object(setup.os, 'geteuid', return_value=1000), \
                 patch.object(setup.sys.stdin, 'isatty', return_value=True), \
                 patch.object(setup.shutil, 'which', return_value='/usr/bin/true'), \
                 patch('builtins.input', side_effect=['https://press.example.org','test-client','61446131']), \
                 patch.object(setup.getpass, 'getpass', side_effect=[client_secret,token]):
                setup.configure()
            env = setup.read_env(config/'server.env')
            self.assertEqual(env['GITHUB_CLIENT_SECRET'],client_secret)
            self.assertEqual(env['AUTH_DATA_DIR'],str(config/'auth'))
            self.assertEqual(env['HOST'],'127.0.0.1')
            units = list((config/'units').glob('*.service'))
            self.assertEqual(len(units),2)
            for file in units:
                content=file.read_text()
                self.assertNotIn(client_secret,content)
                self.assertNotIn(token,content)
            self.assertEqual((config/'server.env').stat().st_mode&0o777,0o600)
            self.assertEqual((config/'tunnel.token').stat().st_mode&0o777,0o600)
            if shutil.which('systemd-analyze'):
                result=subprocess.run(['systemd-analyze','verify',*map(str,units)],capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)

    def test_public_origin_rejects_credentials_paths_and_non_https(self):
        for value in ['http://example.org','https://user:secret@example.org','https://example.org/mcp','https://example.org?token=secret','https://example.org:3000','https://localhost']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                setup.origin(value)
        self.assertEqual(setup.origin('https://Press.Example.org/'),'https://press.example.org')

if __name__=='__main__':
    unittest.main()
