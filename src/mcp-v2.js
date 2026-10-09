import { readFile } from 'node:fs/promises';
import { portable } from './portable.js';
import { preview } from './preview.js';
import { createMcp } from './mcp-server.js';
const guide = await readFile(new URL('../packages/kdca-press/references/editorial.md', import.meta.url), 'utf8');
const formatGuide = await readFile(new URL('../packages/kdca-press/references/draft-format.md', import.meta.url), 'utf8');
export function createPortableMcp(options) {
  return createMcp({portable, guide, formatGuide, ...options, previewer:options.previewer || preview});
}
