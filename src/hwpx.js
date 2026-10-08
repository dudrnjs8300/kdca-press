import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { renderHwpxToSvg, validateHwpx, simulateWrap } from "kordoc";

const HP = "http://www.hancom.co.kr/hwpml/2011/paragraph";
const HH = "http://www.hancom.co.kr/hwpml/2011/head";
const HC = "http://www.hancom.co.kr/hwpml/2011/core";
const list = (n, name) => Array.from(n.getElementsByTagName(name));
const children = (n) =>
  Array.from(n.childNodes).filter((n) => n.nodeType === 1);
const first = (n, name) => list(n, name)[0];
const empty = (n) => {
  while (n.firstChild) n.removeChild(n.firstChild);
};
const parse = (s) =>
  new DOMParser({
    onError: (level) => {
      if (level === "error" || level === "fatalError")
        throw new Error("Invalid template XML");
    },
  }).parseFromString(s, "application/xml");
const serialize = (n) => new XMLSerializer().serializeToString(n);
const lines = (s, width, size) =>
  simulateWrap(s, width, width, size, 100, "keep").lines;

export async function generateHwpx(draft, { synthetic = false } = {}) {
  const zip = await JSZip.loadAsync(
    await readFile(new URL("../templates/kdca-press.hwpx", import.meta.url)),
  );
  const doc = parse(await zip.file("Contents/section0.xml").async("string"));
  const header = parse(await zip.file("Contents/header.xml").async("string"));
  const root = doc.documentElement,
    originals = children(root);
  const el = (name, attrs = {}) => {
    const n = doc.createElementNS(HP, `hp:${name}`);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const p = (value, para = 101, char = 204) => {
    const n = el("p", {
      id: 0,
      paraPrIDRef: para,
      styleIDRef: 0,
      pageBreak: 0,
      columnBreak: 0,
      merged: 0,
    });
    const r = el("run", { charPrIDRef: char }),
      t = el("t");
    t.appendChild(doc.createTextNode(value));
    r.appendChild(t);
    n.appendChild(r);
    return n;
  };
  const setCell = (cell, values, para, char) => {
    const sub = first(cell, "hp:subList");
    empty(sub);
    for (const v of values) sub.appendChild(p(v, para, char));
  };
  // Normalize indents and spacing while retaining the observed institutional fonts.
  for (const id of ["7", "8", "101"]) {
    const pp = list(header, "hh:paraPr").find(
      (n) => n.getAttribute("id") === id,
    );
    for (const tag of ["intent", "left", "right"])
      for (const n of list(pp, `hc:${tag}`)) n.setAttribute("value", "0");
    first(pp, "hh:breakSetting").setAttribute("keepLines", "0");
    if (id === "8") first(pp, "hh:align").setAttribute("horizontal", "LEFT");
    if (id === "101")
      for (const n of list(pp, "hc:next")) n.setAttribute("value", "700");
  }
  // Header is deliberately a draft marker; source logos are not included.
  const headerTable = first(originals[0], "hp:tbl");
  const hc = list(headerTable, "hp:tc");
  setCell(hc[0], ["질병관리청 참고 양식"], 2, 34);
  setCell(hc[1], ["보도자료 초안"], 2, 203);
  setCell(hc[2], [synthetic ? "가상 자료 · 시험용" : "검토 후 배포"], 2, 34);
  const timing = first(originals[1], "hp:tbl"),
    tc = list(timing, "hp:tc");
  setCell(tc[1], [draft.metadata.releaseAt || "확인 필요"], 2, 34);
  setCell(tc[3], [draft.metadata.distributedAt || "확인 필요"], 2, 34);
  const timingHeight = Math.max(
    2800,
    ...[1, 3].map(
      (i) =>
        lines(
          first(tc[i], "hp:subList").textContent,
          Number(first(tc[i], "hp:cellSz").getAttribute("width")) - 1100,
          1000,
        ) *
          1600 +
        400,
    ),
  );
  for (const c of tc)
    first(c, "hp:cellSz").setAttribute("height", timingHeight);
  first(timing, "hp:sz").setAttribute("height", timingHeight);
  const footer = first(originals[1], "hp:footer");
  if (footer) {
    const sub = first(footer, "hp:subList");
    empty(sub);
    sub.appendChild(
      p(
        synthetic
          ? "가상 자료로 만든 시험용 초안 · 실제 발표 자료가 아닙니다."
          : "AI 작성 보조 초안 · 사실 및 배포 승인 확인 필요",
        2,
        34,
      ),
    );
  }
  const titleTable = first(originals[2], "hp:tbl"),
    titleCells = list(titleTable, "hp:tc");
  setCell(titleCells[0], [draft.title], 7, 202);
  setCell(
    titleCells[1],
    draft.summaries.map((s) => `- ${s}`),
    8,
    203,
  );
  const titleHeight = lines(draft.title, 44500, 2600) * 3200 + 700;
  const summaryHeight =
    draft.summaries.reduce(
      (n, s) => n + lines(`- ${s}`, 44500, 1400) * 2300,
      0,
    ) + 600;
  first(titleCells[0], "hp:cellSz").setAttribute("height", titleHeight);
  first(titleCells[1], "hp:cellSz").setAttribute("height", summaryHeight);
  first(titleTable, "hp:sz").setAttribute(
    "height",
    titleHeight + summaryHeight,
  );
  titleTable.setAttribute("pageBreak", "NONE");
  for (const node of originals.slice(3)) root.removeChild(node);
  root.appendChild(p("", 95, 34));
  if (synthetic)
    root.appendChild(
      p("※ 이 문서는 가상 원문을 이용한 기능 검증용 초안입니다.", 101, 206),
    );

  function table(data) {
    const out = p("", 0, 34),
      run = first(out, "hp:run");
    empty(run);
    const tbl = timing.cloneNode(true);
    for (const r of list(tbl, "hp:tr")) tbl.removeChild(r);
    tbl.setAttribute("rowCnt", data.rows.length + 2);
    tbl.setAttribute("colCnt", data.columns.length);
    tbl.setAttribute("pageBreak", "CELL");
    tbl.setAttribute("repeatHeader", "1");
    const widths = data.columns.map(
      (_, i) =>
        Math.floor(47415 / data.columns.length) +
        (i === data.columns.length - 1 ? 47415 % data.columns.length : 0),
    );
    const rows = [[data.caption], data.columns, ...data.rows];
    let total = 0;
    rows.forEach((row, ri) => {
      const tr = el("tr"),
        caption = ri === 0;
      const height = Math.max(
        2400,
        ...row.map(
          (s, i) =>
            lines(s, (caption ? 47415 : widths[i]) - 1100, 1000) * 1700 + 500,
        ),
      );
      total += height;
      if (height > 40000)
        throw new Error(
          "표의 한 행이 너무 깁니다. 내용을 줄이거나 표를 나누세요.",
        );
      row.forEach((value, ci) => {
        const cell = tc[0].cloneNode(true);
        cell.setAttribute("name", "");
        cell.setAttribute("header", ri < 2 ? "1" : "0");
        cell.setAttribute("borderFillIDRef", "27");
        setCell(cell, [value], 2, ri < 2 ? 149 : 34);
        first(cell, "hp:cellAddr").setAttribute("colAddr", ci);
        first(cell, "hp:cellAddr").setAttribute("rowAddr", ri);
        first(cell, "hp:cellSpan").setAttribute(
          "colSpan",
          caption ? data.columns.length : 1,
        );
        first(cell, "hp:cellSz").setAttribute(
          "width",
          caption ? 47415 : widths[ci],
        );
        first(cell, "hp:cellSz").setAttribute("height", height);
        tr.appendChild(cell);
      });
      tbl.appendChild(tr);
    });
    first(tbl, "hp:sz").setAttribute("width", 47415);
    first(tbl, "hp:sz").setAttribute("height", total);
    run.appendChild(tbl);
    return out;
  }
  [draft.lead, ...draft.paragraphs].forEach((value, i) => {
    root.appendChild(p(value));
    for (const t of draft.tables.filter((t) => t.afterParagraph === i)) {
      root.appendChild(table(t));
      root.appendChild(p("", 95, 34));
    }
  });
  const meta = draft.metadata;
  root.appendChild(p("", 95, 34));
  root.appendChild(
    table({
      caption: "담당 부서 및 문의",
      columns: ["담당 부서", "담당자", "연락처"],
      rows: [
        [
          meta.department || "확인 필요",
          meta.manager || "확인 필요",
          meta.contact || "확인 필요",
        ],
      ],
    }),
  );
  for (const n of list(root, "hp:linesegarray")) n.parentNode.removeChild(n);
  list(root, "hp:p").forEach((n, i) => n.setAttribute("id", i));
  list(root, "hp:tbl").forEach((n, i) => n.setAttribute("id", 100000 + i));
  // No embedded source documents, thumbnails, logos, old author metadata, or user instructions.
  for (const name of Object.keys(zip.files))
    if (name.startsWith("BinData/") || name === "Preview/PrvImage.png")
      zip.remove(name);
  const manifest = parse(
    await zip.file("Contents/content.hpf").async("string"),
  );
  for (const n of Array.from(manifest.getElementsByTagName("*"))) {
    if (
      n.localName === "item" &&
      /BinData|PrvImage/.test(n.getAttribute("href") || "")
    )
      n.parentNode.removeChild(n);
    if (
      ["title", "creator", "subject", "description", "date", "meta"].includes(
        n.localName,
      )
    )
      empty(n);
  }
  zip.file("Contents/content.hpf", serialize(manifest));
  zip.file("Contents/header.xml", serialize(header));
  zip.file("Contents/section0.xml", serialize(doc));
  zip.file(
    "Preview/PrvText.txt",
    [draft.title, ...draft.summaries, draft.lead, ...draft.paragraphs].join(
      "\r\n",
    ),
  );
  zip.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  const hwpx = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const validation = await validateHwpx(hwpx);
  if (!validation.ok)
    throw new Error(
      `HWPX 구조 검사 실패: ${validation.issues.map((i) => i.message).join("; ")}`,
    );
  const rendered = await renderHwpxToSvg(hwpx, { reflow: true });
  if (rendered.pageCount > 20)
    throw new Error("문서가 20쪽을 초과했습니다. 내용을 나눠 주세요.");
  return {
    hwpx,
    previews: {
      svg: rendered.svg,
      pages: rendered.pageCount,
      width: rendered.width,
      height: rendered.height,
      warnings: rendered.warnings,
    },
    validation,
  };
}
