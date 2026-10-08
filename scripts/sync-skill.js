import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
const source = process.argv[2];
if (!source || !path.isAbsolute(source)) throw new Error('Pass the absolute canonical skill directory.');
await mkdir('packages', { recursive: true });
await cp(source, 'packages/kdca-press', { recursive: true, filter: (p) => !p.includes('__pycache__') && !p.endsWith('.pyc') });
console.log('Distribution copy updated from the canonical skill.');
