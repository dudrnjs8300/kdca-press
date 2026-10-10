import {
  draftSchema,
  reviewDraft,
  prepareBrief,
  kindSchema,
} from "./editorial.js";
import { render } from "./render.js";
import { digest } from "./store.js";

export const problem = (message, status = 400, extra = {}) =>
  Object.assign(new Error(message), { status, ...extra });
export class PressService {
  constructor(store, cfg, renderer = render) {
    this.store = store;
    this.cfg = cfg;
    this.renderer = renderer;
    this.running = new Map();
  }
  prepare(userId, { source, kind, public_data_confirmed }) {
    if (public_data_confirmed !== true)
      throw problem(
        "공개 가능한 원문인지 확인해 주세요. 비공개 자료나 민감정보는 입력하지 마세요.",
      );
    if (
      typeof source !== "string" ||
      source.trim().length < 40 ||
      source.length > this.cfg.maxSourceChars
    )
      throw problem(`원문은 40~${this.cfg.maxSourceChars}자로 입력하세요.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(source))
      throw problem("원문에 지원하지 않는 제어 문자가 있습니다.");
    return prepareBrief(
      this.store.addBrief(userId, source.trim(), kindSchema.parse(kind)),
    );
  }
  brief(userId, id) {
    const b = this.store.brief(id, userId);
    if (!b) throw problem("원문을 찾을 수 없습니다.", 404);
    return b;
  }
  review(userId, id, draft) {
    return reviewDraft(this.brief(userId, id).source, draftSchema.parse(draft));
  }
  links(id) {
    return {
      document_id: id,
      document_url: `${this.cfg.baseUrl}/?document=${id}`,
      download_url: `${this.cfg.baseUrl}/api/documents/${id}/download`,
      access: "본인 GitHub 계정으로 로그인한 브라우저에서 열립니다.",
    };
  }
  async create(userId, id, input, update) {
    const draft = draftSchema.parse(input),
      brief = this.brief(userId, id),
      review = reviewDraft(brief.source, draft);
    if (!review.passed)
      throw problem("사실 점검 오류를 수정한 뒤 다시 생성하세요.", 422, {
        review,
      });
    if (update && !this.store.document(update.id, userId))
      throw problem("문서를 찾을 수 없습니다.", 404);
    // Stable content key makes AI retries idempotent; only a successful save is cached.
    const key = digest(JSON.stringify({ userId, id, draft, update }));
    const previous = this.store.get("creation", key);
    if (!update && previous && this.store.document(previous, userId))
      return { ...this.links(previous), review, reused: true };
    if (this.running.has(key)) return this.running.get(key);
    const task = (async () => {
      const result = await this.renderer(draft, {
        source: brief.source,
        kind: brief.kind,
      });
      const docId = this.store.save(
        userId,
        id,
        draft,
        review,
        result,
        this.cfg.maxDocuments,
        update,
      );
      this.store.put("creation", key, docId, 86400);
      return {
        ...this.links(docId),
        title: draft.title,
        pages: result.previews.pages,
        review,
        preview_note:
          "웹 미리보기와 한컴오피스의 글꼴·페이지 나눔은 다를 수 있습니다.",
      };
    })();
    this.running.set(key, task);
    try {
      return await task;
    } finally {
      this.running.delete(key);
    }
  }
  get(userId, id) {
    const d = this.store.document(id, userId);
    if (!d) throw problem("문서를 찾을 수 없습니다.", 404);
    return d;
  }
  describe(userId, id) {
    const d = this.get(userId, id);
    return {
      ...this.links(id),
      title: d.title,
      draft: d.draft,
      review: d.review,
      revision: d.revision,
      brief_id: d.brief_id,
      pages: d.previews.pages,
    };
  }
}
