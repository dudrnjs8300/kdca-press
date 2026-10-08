const $ = (s) => document.querySelector(s);
let session = {},
  current = null,
  toastTimer;
const toast = (text, error = false) => {
  const t = $("#toast");
  t.textContent = text;
  t.classList.toggle("error", error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), error ? 9000 : 4000);
};
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session.csrf ? { "X-CSRF-Token": session.csrf } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const e = new Error(
      body.review
        ? body.review.errors.map((x) => x.message).join(" / ")
        : body.error || "요청에 실패했습니다.",
    );
    e.review = body.review;
    throw e;
  }
  return body;
}
async function busy(button, fn) {
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "처리 중…";
  try {
    await fn();
  } catch (e) {
    toast(e.message, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
async function clipboard(text) {
  await navigator.clipboard.writeText(text);
  toast("복사했습니다.");
}
function element(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
async function load() {
  session = await api("/api/session");
  $("#mcp-url").value = session.mcpUrl;
  $("#login").hidden = !!session.user;
  $("#logout").hidden = !session.user;
  $("#demo-login").hidden = !session.demo;
  $("#revoke").hidden = !session.user;
  $("#source").maxLength = session.maximumSource;
  await documents();
}
async function documents() {
  $("#signed-out").hidden = !!session.user;
  $("#document-list").hidden = !session.user;
  if (!session.user) return;
  const { documents } = await api("/api/documents"),
    list = $("#document-list");
  list.replaceChildren();
  if (!documents.length) {
    list.appendChild(
      element(
        "p",
        "아직 저장된 문서가 없습니다. AI에서 작성하거나 가상 예시를 시험해 보세요.",
        "muted",
      ),
    );
    return;
  }
  for (const d of documents) {
    const card = element("article", undefined, "card document-card");
    card.append(
      element("div", `HWPX · 수정 ${d.revision}회`, "tag"),
      element("h3", d.title),
      element(
        "p",
        new Date(d.updated * 1000).toLocaleString("ko-KR"),
        "small muted",
      ),
    );
    const actions = element("div", undefined, "actions"),
      open = element("button", "열기 →", "text-button"),
      del = element("button", "삭제", "text-button danger");
    open.onclick = () => busy(open, () => openDocument(d.id));
    del.onclick = () => {
      if (
        confirm(
          "이 문서와 연결된 원문을 삭제할까요? 다른 문서에서 사용하는 원문은 유지됩니다.",
        )
      )
        busy(del, async () => {
          await api(`/api/documents/${d.id}`, { method: "DELETE" });
          if (current?.document_id === d.id) {
            current = null;
            $("#editor").hidden = true;
          }
          await documents();
        });
    };
    actions.append(open, del);
    card.append(actions);
    list.append(card);
  }
}
function reviewView(review) {
  const panel = $("#review");
  panel.replaceChildren();
  panel.append(
    element("span", review.passed ? "규칙 검사 통과" : "확인 필요", "status"),
    element("h3", "배포 전 확인할 내용"),
  );
  const items = [...review.errors, ...review.warnings].map((x) => x.message);
  const labels = {
    releaseAt: "보도시점",
    distributedAt: "배포일시",
    department: "담당 부서",
    manager: "담당자",
    contact: "연락처",
  };
  if (review.missingMetadata.length)
    items.push(
      `확인되지 않은 정보: ${review.missingMetadata.map((k) => labels[k] || k).join(", ")}`,
    );
  items.push(...review.missingFacts);
  const ul = element("ul");
  for (const item of items) ul.append(element("li", item));
  panel.append(ul, element("p", review.limitations, "small muted"));
}
async function openDocument(id) {
  current = await api(`/api/documents/${id}`);
  const d = current.draft,
    f = $("#edit-form");
  for (const k of ["title", "lead"]) f.elements[k].value = d[k];
  f.elements.summaries.value = d.summaries.join("\n");
  f.elements.paragraphs.value = d.paragraphs.join("\n\n");
  for (const k of Object.keys(d.metadata)) f.elements[k].value = d.metadata[k];
  for (const k of ["tables", "evidence"])
    f.elements[k].value = JSON.stringify(d[k], null, 2);
  f.elements.missingFacts.value = d.missingFacts.join("\n");
  $("#download").href = current.download_url;
  $("#preview").src =
    `/api/documents/${id}/preview?revision=${current.revision}`;
  $("#original-source").textContent = current.source;
  reviewView(current.review);
  $("#editor").hidden = false;
  history.replaceState(null, "", `/?document=${id}#editor`);
  $("#editor").scrollIntoView({ behavior: "smooth" });
}
$("#copy-url").onclick = (e) =>
  busy(e.currentTarget, () => clipboard(session.mcpUrl));
$("#source").oninput = () =>
  ($("#source-count").textContent =
    `${$("#source").value.length.toLocaleString()}자`);
$("#example").onclick = (e) =>
  busy(e.currentTarget, async () => {
    const kind = $("#kind").value;
    if (!["symposium", "statistics", "program"].includes(kind))
      throw new Error(
        "예시는 심포지엄, 통계 발표, 사업 발표 중에서 선택하세요.",
      );
    const data = await api(`/api/examples/${kind}`);
    $("#source").value = data.source;
    $("#source").dispatchEvent(new Event("input"));
    $("#public-confirm").checked = true;
    toast("가상 자료입니다. 실제 발표 내용으로 사용하지 마세요.");
  });
$("#copy-prompt").onclick = (e) =>
  busy(e.currentTarget, async () => {
    if (!$("#public-confirm").checked)
      throw new Error("공개 가능한 자료인지 확인해 주세요.");
    if ($("#source").value.trim().length < 40)
      throw new Error("원문을 40자 이상 입력해 주세요.");
    await clipboard(
      `아래 공개 원문으로 KDCA 보도자료 MCP를 사용해 보도자료를 작성해줘. 유형: ${$("#kind").value}. prepare_press_release의 편집 지침에 따라 핵심 메시지와 독자 관점으로 재구성하고, 원문 근거와 수치를 지켜 퇴고해줘. review_press_release로 점검한 후 create_press_release로 HWPX를 만들고 내 문서함 링크를 알려줘. 없는 날짜·담당자·발언은 만들지 말고 확인할 항목으로 남겨줘.\n\n[공개 가능한 원문]\n${$("#source").value.trim()}`,
    );
  });
$("#demo-login").onclick = (e) =>
  busy(e.currentTarget, async () => {
    await api("/auth/demo", { method: "POST", body: "{}" });
    await load();
    toast("로컬 체험 계정으로 로그인했습니다.");
  });
$("#logout").onclick = (e) =>
  busy(e.currentTarget, async () => {
    await api("/auth/logout", { method: "POST", body: "{}" });
    current = null;
    $("#editor").hidden = true;
    await load();
  });
$("#refresh").onclick = (e) => busy(e.currentTarget, documents);
$("#sample-render").onclick = (e) =>
  busy(e.currentTarget, async () => {
    if (!session.user) {
      $("#workspace").scrollIntoView();
      throw new Error("먼저 문서함에 로그인해 주세요.");
    }
    const kind = $("#kind").value;
    if (!["symposium", "statistics", "program"].includes(kind))
      throw new Error("세 가지 예시 유형 중 하나를 선택하세요.");
    const c = await api(`/api/examples/${kind}`),
      brief = await api("/api/briefs", {
        method: "POST",
        body: JSON.stringify({
          kind,
          source: c.source,
          public_data_confirmed: true,
        }),
      }),
      doc = await api("/api/documents", {
        method: "POST",
        body: JSON.stringify({ brief_id: brief.brief_id, draft: c.draft }),
      });
    await documents();
    await openDocument(doc.document_id);
    toast("가상 초안의 HWPX를 생성했습니다.");
  });
$("#edit-form").onsubmit = (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const f = e.currentTarget || $("#edit-form"),
      d = structuredClone(current.draft);
    for (const k of ["title", "lead"]) d[k] = f.elements[k].value.trim();
    d.summaries = f.elements.summaries.value
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    d.paragraphs = f.elements.paragraphs.value
      .split(/\n\s*\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const k of Object.keys(d.metadata))
      d.metadata[k] = f.elements[k].value.trim();
    for (const k of ["tables", "evidence"]) {
      try {
        d[k] = JSON.parse(f.elements[k].value);
      } catch {
        throw new Error(
          `${k === "tables" ? "표" : "근거"} JSON 형식이 올바르지 않습니다.`,
        );
      }
    }
    d.missingFacts = f.elements.missingFacts.value
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      await api(`/api/documents/${current.document_id}`, {
        method: "PUT",
        body: JSON.stringify({ revision: current.revision, draft: d }),
      });
    } catch (error) {
      if (error.review) reviewView(error.review);
      throw error;
    }
    await documents();
    await openDocument(current.document_id);
    toast("수정본을 저장했습니다.");
  });
};
$("#close-editor").onclick = () => {
  $("#editor").hidden = true;
  history.replaceState(null, "", "/#workspace");
};
$("#revoke").onclick = (e) => {
  if (
    confirm(
      "모든 AI 연결의 접근 권한을 해제할까요? 다음 사용 시 다시 연결해야 합니다.",
    )
  )
    busy(e.currentTarget, async () => {
      await api("/api/connections/revoke", { method: "POST", body: "{}" });
      toast("AI 접근 권한을 해제했습니다.");
    });
};
load()
  .then(async () => {
    const id = new URL(location.href).searchParams.get("document");
    if (id && session.user) await openDocument(id);
    else if (id && /^[0-9a-f-]{36}$/.test(id)) {
      for (const link of document.querySelectorAll('a[href="/auth/github"]')) {
        link.href = `/auth/github?next=${encodeURIComponent(`/?document=${id}`)}`;
      }
    }
  })
  .catch((e) => toast(e.message, true));
