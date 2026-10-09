import { randomBytes, createHash } from 'node:crypto';
export const secret = () => randomBytes(32).toString('base64url');
export const digest = s => createHash('sha256').update(s).digest('hex');
export const now = () => Math.floor(Date.now() / 1000);
