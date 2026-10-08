import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";
import { PressService } from "../src/service.js";
import { draftSchema, reviewDraft } from "../src/editorial.js";
import { loadConfig } from "../src/config.js";
import { generateHwpx } from "../src/hwpx.js";
import JSZip from "jszip";
const example = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`../examples/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

test("production cannot expose local demo login or use HTTP", () => {
  assert.throws(() =>
    loadConfig({
      PUBLIC_BASE_URL: "https://service.example",
      DEMO_MODE: "true",
    }),
  );
  assert.throws(() =>
    loadConfig({
      PUBLIC_BASE_URL: "http://service.example",
      GITHUB_CLIENT_ID: "x",
      GITHUB_CLIENT_SECRET: "x",
    }),
  );
  assert.throws(() =>
    loadConfig({
      PUBLIC_BASE_URL: "http://localhost:3000",
      DEMO_MODE: "true",
      NODE_ENV: "production",
    }),
  );
});
test("three fixtures pass source review and preserve every paragraph/table cell in valid HWPX", async () => {
  for (const name of ["symposium", "statistics", "program"]) {
    const c = await example(name),
      d = draftSchema.parse(c.draft),
      review = reviewDraft(c.source, d);
    assert.equal(review.passed, true, JSON.stringify(review));
    const result = await generateHwpx(d, { synthetic: true });
    assert.equal(result.validation.ok, true);
    assert.ok(result.previews.pages >= 1);
    const zip = await JSZip.loadAsync(result.hwpx),
      xml = await zip.file("Contents/section0.xml").async("string");
    for (const text of [
      d.title,
      ...d.summaries,
      d.lead,
      ...d.paragraphs,
      ...d.tables.flatMap((t) => [t.caption, ...t.rows.flat()]),
    ])
      assert.ok(
        xml.includes(
          text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;"),
        ),
        `missing text ${name}`,
      );
    assert.ok(xml.includes("가상 자료"));
    assert.equal(
      Object.keys(zip.files).some((n) => n.startsWith("BinData/")),
      false,
    );
    assert.equal(result.previews.warnings.length, 0);
  }
});
test("review rejects fabricated numbers, switched units, invented quotations and broken tables", async () => {
  const c = await example("statistics"),
    d = draftSchema.parse(c.draft);
  for (const [value, code] of [
    ["내성 분리주는 99999건이다.", "unsupported_numbers"],
    ["내성률은 1.0% 상승했다.", "changed_units"],
    [
      "담당자는 “전국 모든 감염병을 완벽히 해결했다”라고 말했다.",
      "unsupported_quote",
    ],
  ]) {
    const changed = structuredClone(d);
    changed.paragraphs.push(value);
    assert.ok(
      reviewDraft(c.source, changed).errors.some((x) => x.code === code),
    );
  }
  const changed = structuredClone(d);
  changed.tables[0].rows[0].pop();
  assert.ok(
    reviewDraft(c.source, changed).errors.some((x) => x.code === "table_shape"),
  );
  changed.tables = [];
  changed.evidence[0].sourceQuote = "원문에 없는 새로운 발언";
  assert.ok(
    reviewDraft(c.source, changed).errors.some(
      (x) => x.code === "evidence_not_in_source",
    ),
  );
});
test("owner isolation, idempotency, revision conflicts, durable restart and deletion", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pressroom-"));
  let store = new Store(dir);
  try {
    store.user("alice", "alice");
    store.user("bob", "bob");
    const cfg = {
      baseUrl: "http://localhost",
      maxSourceChars: 24000,
      maxDocuments: 5,
    };
    let renders = 0;
    const service = new PressService(store, cfg, async () => {
      renders++;
      return {
        hwpx: Buffer.from("fixture"),
        previews: { svg: "<svg/>", pages: 1 },
      };
    });
    const c = await example("program"),
      brief = service.prepare("alice", { ...c, public_data_confirmed: true });
    assert.throws(() => service.brief("bob", brief.brief_id), { status: 404 });
    const created = await service.create("alice", brief.brief_id, c.draft);
    assert.equal(store.list("bob").length, 0);
    assert.throws(() => service.get("bob", created.document_id), {
      status: 404,
    });
    assert.equal(
      (await service.create("alice", brief.brief_id, c.draft)).document_id,
      created.document_id,
    );
    assert.equal(renders, 1);
    await service.create("alice", brief.brief_id, c.draft, {
      id: created.document_id,
      revision: 1,
    });
    await assert.rejects(
      () =>
        service.create("alice", brief.brief_id, c.draft, {
          id: created.document_id,
          revision: 1,
        }),
      { status: 409 },
    );
    store.close();
    store = new Store(dir);
    assert.equal(store.document(created.document_id, "alice").revision, 2);
    assert.equal(store.deleteDocument(created.document_id, "bob"), false);
    assert.equal(store.deleteDocument(created.document_id, "alice"), true);
    assert.equal(store.brief(brief.brief_id, "alice"), undefined);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
