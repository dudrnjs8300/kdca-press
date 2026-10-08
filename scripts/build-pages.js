import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const built=spawnSync(process.env.PYTHON_BIN||'python3',['scripts/build-packages.py'],{stdio:'inherit'});
if(built.status)process.exit(built.status);
await mkdir('site-dist',{recursive:true});
await cp('web','site-dist',{recursive:true});
await mkdir('site-dist/downloads',{recursive:true});
await cp('dist','site-dist/downloads',{recursive:true});
await writeFile('site-dist/.nojekyll','');
// A static guide works before a remote server exists.
const raw=process.env.PUBLIC_BASE_URL;
if(raw){
  const base=new URL(raw);
  if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw new Error('PUBLIC_BASE_URL must be an HTTPS origin.');
  const safe=base.origin.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html=await readFile('site-dist/index.html','utf8');
  await writeFile('site-dist/index.html',html.replace('원격 MCP 운영 주소는 배포 후 제공됩니다.',safe+'/mcp'));
}
// Static Pages must not attempt authenticated dynamic endpoints.
await writeFile('site-dist/connect.js','// Static download and installation guide.\n');
console.log('GitHub Pages guide and offline installers built.');
