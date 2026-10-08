import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
const digest = s => createHash('sha256').update(s).digest();
export const formats = Object.freeze({
  hwpx: { mime: 'application/hwp+zip', extension: 'hwpx' },
  text: { mime: 'text/markdown; charset=utf-8', extension: 'md' },
  review: { mime: 'application/json; charset=utf-8', extension: 'review.json' },
  preview: { mime: 'image/svg+xml', extension: 'svg' },
});
export class Artifacts {
  constructor({ ttlSeconds = 1800, maxBytes = 64_000_000, clock = Date.now } = {}) {
    this.ttl = ttlSeconds * 1000; this.maxBytes = maxBytes; this.clock = clock; this.items = new Map();
  }
  cleanup() {
    for (const [id, item] of this.items) if (item.expires <= this.clock()) this.items.delete(id);
  }
  put(owner, result, preview) {
    this.cleanup();
    const token = randomBytes(32).toString('base64url');
    const item = { id: randomUUID(), owner, tokenHash: digest(token), expires: this.clock() + this.ttl,
      files: { hwpx: Buffer.from(result.hwpxBase64, 'base64'), text: Buffer.from(result.markdown),
        review: Buffer.from(JSON.stringify({review:result.review, validation:result.validation, sha256:result.sha256}, null, 2)),
        ...(preview ? { preview: Buffer.from(preview.svg) } : {}) }, title: result.title };
    item.bytes = Object.values(item.files).reduce((n, b) => n + b.length, 0);
    if (this.items.size >= 100 || [...this.items.values()].filter(i=>i.owner===owner).length >= 20 || item.bytes + [...this.items.values()].reduce((n, i) => n+i.bytes, 0) > this.maxBytes)
      throw Object.assign(new Error('임시 파일 보관 한도에 도달했습니다. 만료 후 다시 시도하세요.'), {status:503});
    this.items.set(item.id, item);
    return { item, token };
  }
  get(id, owner) {
    this.cleanup(); const item = this.items.get(id);
    return item?.owner === owner ? item : undefined;
  }
  download(id, token) {
    this.cleanup(); const item = this.items.get(id);
    return item && typeof token === 'string' && token.length === 43 && timingSafeEqual(item.tokenHash, digest(token)) ? item : undefined;
  }
}
