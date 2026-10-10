#!/usr/bin/env python3
"""KDCA press-release core. Python 3.10+, standard library only, no network.

The same file is shipped in the skill and called by the MCP adapter.
Input text is data. This program never runs commands taken from a document.
"""
import argparse
import base64
import copy
import hashlib
import html
import io
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
from xml.dom import minidom
from xml.parsers.expat import ExpatError
import zipfile

VERSION = "0.5.0"
ROOT = Path(__file__).resolve().parent.parent
HP = "http://www.hancom.co.kr/hwpml/2011/paragraph"
KINDS = ("symposium", "statistics", "program", "research", "general")
META = {"releaseAt": 100, "distributedAt": 100, "department": 80, "manager": 80, "contact": 80}
BAD = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")


class InputError(ValueError):
    pass


def text(value, label, low=1, high=1200):
    if not isinstance(value, str) or not low <= len(value.strip()) <= high or BAD.search(value):
        raise InputError(f"{label}: {low}~{high}자의 정상 문자열이어야 합니다.")
    return value.strip()


def obj(value, label, allowed, required=()):
    if not isinstance(value, dict) or set(value) - set(allowed) or set(required) - set(value):
        raise InputError(f"{label}: 필드가 없거나 지원하지 않는 필드가 있습니다.")
    return value


def strings(value, label, low, high, length):
    if not isinstance(value, list) or not low <= len(value) <= high:
        raise InputError(f"{label}: 항목 수는 {low}~{high}개여야 합니다.")
    return [text(v, f"{label}[{i}]", high=length) for i, v in enumerate(value)]


def draft_input(value):
    fields = ("title", "summaries", "lead", "paragraphs", "tables", "metadata", "evidence", "missingFacts")
    d = copy.deepcopy(obj(value, "draft", fields, fields[:4] + ("evidence",)))
    for k, limit in (("title", 110), ("lead", 700)):
        d[k] = text(d[k], k, high=limit)
    d["summaries"] = strings(d["summaries"], "summaries", 1, 3, 150)
    d["paragraphs"] = strings(d["paragraphs"], "paragraphs", 2, 24, 1200)
    d["missingFacts"] = strings(d.get("missingFacts", []), "missingFacts", 0, 15, 200)
    m = obj(d.get("metadata", {}), "metadata", META)
    d["metadata"] = {k: text(m.get(k, ""), k, low=0, high=limit) for k, limit in META.items()}
    d.setdefault("tables", [])
    if not isinstance(d["tables"], list) or len(d["tables"]) > 3:
        raise InputError("표는 3개까지 지원합니다.")
    for t in d["tables"]:
        obj(t, "table", ("caption", "columns", "rows", "afterParagraph"), ("caption", "columns", "rows", "afterParagraph"))
        t["caption"] = text(t["caption"], "caption", high=100)
        t["columns"] = strings(t["columns"], "columns", 2, 6, 60)
        if not isinstance(t["rows"], list) or not 1 <= len(t["rows"]) <= 15:
            raise InputError("표의 데이터 행은 1~15개여야 합니다.")
        t["rows"] = [strings(r, "row", 2, 6, 150) for r in t["rows"]]
        if type(t["afterParagraph"]) is not int or not 0 <= t["afterParagraph"] <= 24:
            raise InputError("afterParagraph는 0~24 정수여야 합니다.")
    if not isinstance(d["evidence"], list) or not 1 <= len(d["evidence"]) <= 60:
        raise InputError("핵심 주장과 원문 근거를 evidence에 1~60개 연결하세요.")
    for ev in d["evidence"]:
        obj(ev, "evidence", ("claim", "sourceQuote"), ("claim", "sourceQuote"))
        ev["claim"] = text(ev["claim"], "claim", high=500)
        ev["sourceQuote"] = text(ev["sourceQuote"], "sourceQuote", high=900)
    return d


def numeric_tokens(value):
    s = unicodedata.normalize("NFKC", value)
    s = re.sub(r"(?<=\d),(?=\d)", "", s)
    s = re.sub(r"(?<=\d)[ \t]+(?=%|명|건|개|회|원|년|월|일|시|분)", "", s)
    return list(dict.fromkeys(re.sub(r"^0+(?=\d)", "", n) for n in re.findall(r"\d+(?:\.\d+)?(?:%p|%|억|만|천|년|월|일|명|건|개|회|원|시|분)?", s)))


def normalize(value):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value).replace(",", ""))


def all_text(d):
    return [d["title"], *d["summaries"], d["lead"], *d["paragraphs"],
            *(s for t in d["tables"] for s in [t["caption"], *t["columns"], *(v for r in t["rows"] for v in r)]),
            *d["metadata"].values()]


def review(source, d):
    errors, warnings = [], []
    def issue(items, code, message):
        items.append({"code": code, "message": message})
    body = "\n".join(all_text(d))
    sn = numeric_tokens(source)
    bare = lambda s: re.match(r"\d+(?:\.\d+)?", s).group()
    new = [n for n in numeric_tokens(body) if n not in sn and bare(n) not in {bare(s) for s in sn}]
    if new:
        issue(errors, "unsupported_numbers", "원문에 없는 수치: " + ", ".join(new))
    unit = re.compile(r"(%p|%|명|건|개|회|원)$")
    changed = [n for n in numeric_tokens(body) if unit.search(n) and n not in sn
               and any(unit.search(s) and unit.sub("", s) == unit.sub("", n) for s in sn)]
    if changed:
        issue(errors, "changed_units", "원문과 단위가 다른 수치: " + ", ".join(changed))
    for ev in d["evidence"]:
        if normalize(ev["sourceQuote"]) not in normalize(source):
            issue(errors, "evidence_not_in_source", "근거 인용이 원문과 다릅니다: " + ev["claim"][:70])
    for quote in re.findall(r'[“"]([^”"\n]{8,})[”"]', body):
        if normalize(quote) not in normalize(source):
            issue(errors, "unsupported_quote", "원문에 없는 직접 인용문이 있습니다.")
    for t in d["tables"]:
        if any(len(r) != len(t["columns"]) for r in t["rows"]):
            issue(errors, "table_shape", "표의 열 수가 일치하지 않습니다.")
        if t["afterParagraph"] > len(d["paragraphs"]):
            issue(errors, "table_position", "표 위치가 본문 범위를 벗어납니다.")
    if len(body) > 16000:
        issue(errors, "document_too_long", "본문과 표는 합계 16,000자까지 지원합니다.")
    completed = r"개최했다|개최하였다|달성했다|달성하였다|입증했다|입증하였다|선정했다|선정하였다"
    if re.search(r"계획|예정|추진하고자|목표", source) and re.search(completed, body) and not re.search(completed, source):
        issue(errors, "plan_as_result", "계획이 완료된 성과로 바뀌었을 가능성이 있습니다.")
    for pat, code, message in [
        (r"유의하게|통계적으로 유의", "unsupported_significance", "원문에 없는 통계적 유의성 표현입니다."),
    ]:
        if re.search(pat, body) and not re.search(pat, source):
            issue(errors, code, message)
    if re.search(r"전국|전체 국민", body) and not re.search(r"전국|전체 국민", source):
        issue(warnings, "scope", "전국·전체 국민이라는 표현의 적용 범위를 확인하세요.")
    if re.search(r"획기적|세계 최초|대폭|완벽|혁신적", body):
        issue(warnings, "promotional", "강한 평가 표현의 근거를 확인하세요.")
    if len(re.findall(r"계획이다|예정이다", body)) > 6:
        issue(warnings, "repetition", "계획이다·예정이다가 반복됩니다. 확정 수준을 유지하며 퇴고하세요.")
    if any(len(s) > 65 for s in d["summaries"]):
        issue(warnings, "long_summary", "요약문을 더 간결하게 다듬을지 검토하세요.")
    if any(len(s) > 650 for s in d["paragraphs"]):
        issue(warnings, "long_paragraph", "긴 문단을 의미 단위로 나눌지 검토하세요.")
    return {"passed": not errors, "errors": errors, "warnings": warnings,
            "missingMetadata": [k for k, v in d["metadata"].items() if not v],
            "missingFacts": d["missingFacts"],
            "limitations": "규칙 기반 보조 검사입니다. 의미·인과관계·숫자의 역할·사실 누락은 AI와 담당자가 원문을 직접 대조해야 합니다."}


def elements(node, name):
    return list(node.getElementsByTagName(name))


def first(node, name):
    return elements(node, name)[0]


def empty(node):
    for child in list(node.childNodes):
        node.removeChild(child)


def parse_xml(value):
    if re.search(r"<!DOCTYPE|<!ENTITY", value, re.I):
        raise InputError("DTD와 외부 엔터티는 허용되지 않습니다.")
    return minidom.parseString(value)


def estimated_lines(value, width, size):
    # Conservative cell sizing; native Hancom handles final line composition.
    def weight(c):
        if c.isspace(): return 0.5
        if unicodedata.east_asian_width(c) in "WF": return 1.0
        if c in "ilI.,:;!'|": return 0.35
        if c in "MW@%": return 0.9
        return 0.65
    return max(1, sum(max(1, math.ceil(sum(weight(c) for c in line) * size / max(width, size))) for line in value.split("\n")))


def make_hwpx(d, synthetic=False):
    # synthetic is accepted for old callers but never changes visible document text.
    entries = json.loads((ROOT / "assets/template.json").read_text(encoding="utf-8"))
    doc = parse_xml(entries["Contents/section0.xml"])
    root = doc.documentElement
    originals = [n for n in root.childNodes if n.nodeType == n.ELEMENT_NODE]

    def el(name, **attrs):
        n = doc.createElementNS(HP, "hp:" + name)
        for k, v in attrs.items(): n.setAttribute(k, str(v))
        return n

    def p(value, para=29, char=89):
        n = el("p", id=0, paraPrIDRef=para, styleIDRef=0, pageBreak=0, columnBreak=0, merged=0)
        r, t = el("run", charPrIDRef=char), el("t")
        t.appendChild(doc.createTextNode(value)); r.appendChild(t); n.appendChild(r)
        return n

    def cell(c, values, para, char):
        sub = first(c, "hp:subList"); empty(sub)
        for value in values: sub.appendChild(p(value, para, char))

    def set_height(tbl, cells, heights):
        for c, height in zip(cells, heights):
            first(c, "hp:cellSz").setAttribute("height", str(height))
        first(tbl, "hp:sz").setAttribute("height", str(sum(heights)))

    # Keep the original top banner, page setup, page number and footer artwork.
    timing = first(originals[1], "hp:tbl")
    tc = elements(timing, "hp:tc")
    for index, key in ((1, "releaseAt"), (3, "distributedAt")):
        cell(tc[index], [d["metadata"][key]], 17, 40 if index == 1 else 121)
    timing_height = max(2797, *(estimated_lines(d["metadata"][key], int(first(tc[i], "hp:cellSz").getAttribute("width")) - 1020, 1000) * 1600 + 282 for i, key in ((1, "releaseAt"), (3, "distributedAt"))))
    for c in tc: first(c, "hp:cellSz").setAttribute("height", str(timing_height))
    first(timing, "hp:sz").setAttribute("height", str(timing_height))

    # The title block also contains the footer's table: select the named title cell.
    title = next(t for t in elements(originals[3], "hp:tbl") if any(c.getAttribute("name") == "제목명" for c in elements(t, "hp:tc")))
    title_cells = elements(title, "hp:tc")
    cell(title_cells[0], [d["title"]], 41, 66)
    cell(title_cells[1], ["- " + s for s in d["summaries"]], 83, 81)
    title_width = int(first(title, "hp:sz").getAttribute("width"))
    h1 = estimated_lines(d["title"], title_width - 2000, 2600 * .89) * 3120 + 282
    h2 = sum(estimated_lines("- " + s, title_width - 2500, 1400) * 2240 for s in d["summaries"]) + 282
    set_height(title, title_cells, (h1, h2))
    title.setAttribute("pageBreak", "NONE")
    contact = first(originals[5], "hp:tbl").cloneNode(True)
    for node in originals[5:]: root.removeChild(node)

    def table(t):
        out = p("", 13, 41); run = first(out, "hp:run"); empty(run)
        tbl = timing.cloneNode(True)
        for row in elements(tbl, "hp:tr"): tbl.removeChild(row)
        cols = len(t["columns"])
        for key, value in {"rowCnt": len(t["rows"]) + 2, "colCnt": cols, "pageBreak": "CELL", "repeatHeader": 1}.items(): tbl.setAttribute(key, str(value))
        widths = [47414 // cols + (47414 % cols if i == cols - 1 else 0) for i in range(cols)]
        total = 0
        for ri, row in enumerate([[t["caption"]], t["columns"], *t["rows"]]):
            tr = el("tr"); caption = ri == 0
            height = max(2000, *(estimated_lines(s, (47414 if caption else widths[i]) - 1020, 1000) * 1600 + 400 for i, s in enumerate(row)))
            if height > 40000: raise InputError("표의 한 행이 너무 깁니다. 본문으로 옮기거나 행을 나누세요.")
            total += height
            for ci, value in enumerate(row):
                c = tc[0].cloneNode(True)
                for k, v in {"name": "", "header": 1 if ri < 2 else 0, "borderFillIDRef": 2}.items(): c.setAttribute(k, str(v))
                cell(c, [value], 17, 40 if ri < 2 else 41)
                for tag, attrs in {"hp:cellAddr": {"colAddr": ci, "rowAddr": ri}, "hp:cellSpan": {"colSpan": cols if caption else 1, "rowSpan": 1}, "hp:cellSz": {"width": 47414 if caption else widths[ci], "height": height}}.items():
                    for k, v in attrs.items(): first(c, tag).setAttribute(k, str(v))
                tr.appendChild(c)
            tbl.appendChild(tr)
        first(tbl, "hp:sz").setAttribute("width", "47414")
        first(tbl, "hp:sz").setAttribute("height", str(total))
        run.appendChild(tbl)
        return out

    for i, value in enumerate([d["lead"], *d["paragraphs"]]):
        # The reference uses two leading spaces and an empty body paragraph between ideas.
        root.appendChild(p("  " + value))
        root.appendChild(p(""))
        for t in d["tables"]:
            if t["afterParagraph"] == i:
                root.appendChild(table(t)); root.appendChild(p(""))

    # Original contact-row geometry; missing metadata is blank, with omissions in review JSON.
    rows = elements(contact, "hp:tr")
    for row in rows[1:]: contact.removeChild(row)
    cells = elements(rows[0], "hp:tc")
    merged_width = sum(int(first(c, "hp:cellSz").getAttribute("width")) for c in cells[3:5])
    rows[0].removeChild(cells[4])
    cells = elements(rows[0], "hp:tc")
    values = ["담당 부서", d["metadata"]["department"], "담당자", d["metadata"]["manager"], d["metadata"]["contact"]]
    first(cells[3], "hp:cellSz").setAttribute("width", str(merged_width))
    contact_height = max(1700, *(estimated_lines(value, int(first(c, "hp:cellSz").getAttribute("width")) - 1020, 1000) * 1600 + 282 for c, value in zip(cells, values)))
    for i, (c, value) in enumerate(zip(cells, values)):
        cell(c, [value], 17, 41)
        if i < 2: c.setAttribute("borderFillIDRef", "2")
        first(c, "hp:cellAddr").setAttribute("colAddr", str(i))
        first(c, "hp:cellAddr").setAttribute("rowAddr", "0")
        first(c, "hp:cellSpan").setAttribute("colSpan", "1")
        first(c, "hp:cellSpan").setAttribute("rowSpan", "1")
        first(c, "hp:cellSz").setAttribute("height", str(contact_height))
    contact.setAttribute("rowCnt", "1"); contact.setAttribute("colCnt", "5")
    contact.setAttribute("pageBreak", "NONE")
    first(contact, "hp:sz").setAttribute("height", str(contact_height))
    out = p("", 13, 41); first(out, "hp:run").appendChild(contact); root.appendChild(out)

    # Changed cells have new paragraphs. Preserve caches inside unchanged artwork
    # and timing labels; discard only outer flow positions after the fixed banner.
    for block in originals[1:5]:
        for n in list(block.childNodes):
            if getattr(n, "tagName", "") == "hp:linesegarray": block.removeChild(n)
    for tag, start in (("hp:p", 0), ("hp:tbl", 100000)):
        for i, n in enumerate(elements(root, tag), start): n.setAttribute("id", str(i))
    entries["Contents/section0.xml"] = doc.toxml()
    entries["Preview/PrvText.txt"] = "\r\n".join(all_text(d))
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w") as archive:
        for name in ["mimetype", *sorted(n for n in entries if n != "mimetype")]:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
            value = entries[name]
            archive.writestr(info, base64.b64decode(value["base64"], validate=True) if isinstance(value, dict) else value.encode("utf-8"))
    data = stream.getvalue()
    validate_hwpx(data, d)
    return data


def validate_hwpx(data, draft=None):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        entries = z.infolist()
        if len(entries) > 100 or sum(i.file_size for i in entries) > 5_000_000:
            raise InputError("문서 크기 제한을 초과했습니다.")
        if len({i.filename for i in entries}) != len(entries): raise InputError("중복 ZIP 항목입니다.")
        for i in entries:
            if i.filename.startswith("/") or ".." in i.filename.replace("\\", "/").split("/"):
                raise InputError("잘못된 문서 내부 경로입니다.")
        if entries[0].filename != "mimetype" or entries[0].compress_type != zipfile.ZIP_STORED or z.read("mimetype") != b"application/hwp+zip":
            raise InputError("HWPX mimetype 형식이 올바르지 않습니다.")
        for name in z.namelist():
            if name.endswith((".xml", ".hpf", ".rdf")): parse_xml(z.read(name).decode("utf-8"))
        section = parse_xml(z.read("Contents/section0.xml").decode("utf-8"))
        header = parse_xml(z.read("Contents/header.xml").decode("utf-8"))
        chars = {n.getAttribute("id") for n in elements(header, "hh:charPr")}
        paras = {n.getAttribute("id") for n in elements(header, "hh:paraPr")}
        for tag, attr, ids in (("hp:run", "charPrIDRef", chars), ("hp:p", "paraPrIDRef", paras)):
            for n in elements(section, tag):
                if n.getAttribute(attr) not in ids: raise InputError("존재하지 않는 서식 참조입니다.")
        manifest = parse_xml(z.read("Contents/content.hpf").decode("utf-8"))
        images = {n.getAttribute("id"): n.getAttribute("href") for n in elements(manifest, "*") if n.localName == "item" and n.getAttribute("media-type").startswith("image/")}
        for n in elements(section, "hc:img"):
            ref = n.getAttribute("binaryItemIDRef")
            if ref not in images or images[ref] not in z.namelist():
                raise InputError("문서에서 참조하는 이미지가 누락되었습니다.")
        present = "\n".join("".join(c.data for c in n.childNodes if c.nodeType == c.TEXT_NODE) for n in elements(section, "hp:t"))
        if draft:
            for s in all_text(draft):
                if s and s not in present: raise InputError("문서 생성 중 내용이 누락되었습니다.")
    return {"ok": True, "checks": ["ZIP/mimetype", "XML", "서식 참조", "내장 이미지 참조", "입력 본문·표 보존" if draft else "입력 원문 미제공"], "nativeHancomVerified": False}


def markdown(d):
    lines = ["# " + d["title"], "", *("- " + s for s in d["summaries"]), ""]
    for i, value in enumerate([d["lead"], *d["paragraphs"]]):
        lines += [value, ""]
        for t in d["tables"]:
            if t["afterParagraph"] != i: continue
            escape = lambda s: s.replace("|", "\\|").replace("\n", " ")
            lines += [t["caption"], "", "| " + " | ".join(map(escape, t["columns"])) + " |", "| " + " | ".join("---" for _ in t["columns"]) + " |"]
            lines += ["| " + " | ".join(map(escape, row)) + " |" for row in t["rows"]]
            lines += [""]
    return "\n".join(lines)


def html_preview(d):
    esc = html.escape
    sections = ["<h1>" + esc(d["title"]) + "</h1>", "<ul>" + "".join("<li>" + esc(s) + "</li>" for s in d["summaries"]) + "</ul>"]
    for i, p in enumerate([d["lead"], *d["paragraphs"]]):
        sections.append("<p>" + esc(p) + "</p>")
        for t in d["tables"]:
            if t["afterParagraph"] == i:
                sections.append("<table><caption>" + esc(t["caption"]) + "</caption><thead><tr>" + "".join("<th>" + esc(c) + "</th>" for c in t["columns"]) + "</tr></thead><tbody>" + "".join("<tr>" + "".join("<td>" + esc(c) + "</td>" for c in r) + "</tr>" for r in t["rows"]) + "</tbody></table>")
    return '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KDCA 보도자료 내용 검토</title><style>body{max-width:850px;margin:40px auto;padding:20px;font:17px/1.85 sans-serif;color:#172d29}h1{line-height:1.4}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #bbc9c4;padding:8px;overflow-wrap:anywhere}aside{font-size:13px;color:#52655e}</style><aside>내용 검토 화면 · 실제 HWPX의 쪽 나눔과 글꼴을 재현하는 화면은 아닙니다.</aside>' + "".join(sections) + "</html>"


def process(payload, action):
    if not isinstance(payload, dict): raise InputError("JSON 객체를 입력하세요.")
    source = text(payload.get("source"), "source", 40, 24000)
    kind = payload.get("kind", "general")
    if kind not in KINDS: raise InputError("지원하지 않는 보도자료 유형입니다.")
    if action == "prepare":
        return {"version": VERSION, "kind": kind, "numeric_inventory": numeric_tokens(source), "source_sha256": hashlib.sha256(source.encode()).hexdigest(), "guide": (ROOT / "references/editorial.md").read_text(encoding="utf-8")}
    d = draft_input(payload.get("draft"))
    report = review(source, d)
    if action == "review": return report
    if not report["passed"]: return {"ok": False, "review": report}
    synthetic = bool(re.search(r"가상 자료|가상자료|시험용 원문", source))
    data = make_hwpx(d, synthetic)
    return {"ok": True, "version": VERSION, "title": d["title"], "synthetic": synthetic, "review": report, "validation": validate_hwpx(data, d), "sha256": hashlib.sha256(data).hexdigest(), "hwpxBase64": base64.b64encode(data).decode(), "markdown": markdown(d), "html": html_preview(d)}


def main():
    parser = argparse.ArgumentParser(description="KDCA 보도자료 검사 및 HWPX 생성 · 네트워크/추가 설치 불필요")
    parser.add_argument("action", choices=("prepare", "review", "generate", "validate"))
    parser.add_argument("--input", help="UTF-8 JSON 입력. validate일 때는 HWPX 파일")
    parser.add_argument("--output", help="생성할 .hwpx 파일 경로")
    parser.add_argument("--stdio", action="store_true", help="JSON을 표준입력으로 받고 JSON 결과 반환")
    args = parser.parse_args()
    try:
        if args.action == "validate":
            result = validate_hwpx(Path(args.input).read_bytes())
        else:
            raw = sys.stdin.buffer.read(262145) if args.stdio else Path(args.input).read_bytes()
            if len(raw) > 262144: raise InputError("입력 파일은 256 KiB까지 지원합니다.")
            result = process(json.loads(raw.decode("utf-8-sig")), args.action)
        if args.action == "generate" and result.get("ok") and not args.stdio:
            if not args.output: raise InputError("generate에는 --output 결과.hwpx가 필요합니다.")
            target = Path(args.output).resolve()
            if target.suffix.lower() != ".hwpx": raise InputError("출력 확장자는 .hwpx여야 합니다.")
            outputs = {target: base64.b64decode(result.pop("hwpxBase64")), target.with_suffix(".md"): result.pop("markdown").encode(), target.with_suffix(".preview.html"): result.pop("html").encode()}
            report_path = target.with_suffix(".review.json")
            if any(p.exists() for p in [*outputs, report_path]): raise InputError("기존 결과를 덮어쓰지 않습니다. 새로운 출력 이름을 지정하세요.")
            target.parent.mkdir(parents=True, exist_ok=True)
            outputs[report_path] = json.dumps(result, ensure_ascii=False, indent=2).encode()
            for p, data in outputs.items():
                with p.open("xb") as f: f.write(data)
            result["files"] = {"hwpx": str(target), "text": str(target.with_suffix(".md")), "preview": str(target.with_suffix(".preview.html")), "review": str(report_path)}
        print(json.dumps(result, ensure_ascii=False))
        return 2 if result.get("ok") is False or result.get("passed") is False else 0
    except (ValueError, OSError, KeyError, TypeError, ExpatError, zipfile.BadZipFile) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
