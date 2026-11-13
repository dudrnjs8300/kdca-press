import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {DOMParser} from '@xmldom/xmldom';
import JSZip from 'jszip';
import {portable} from '../src/portable.js';

// Entirely fictional facts; no unpublished manuscript or user draft is used.
const findings = '가상 연구진은 휴대형 장비를 이용한 유전자 검출법을 개발했다.';
const timing = '반응 시간은 22분이며 전처리와 판독을 포함한 총 소요 시간은 35분이다.';
const scope = '실험실에서 현장 적용 가능성을 평가했으며 환자 확진 성능이나 현장 보급은 확인하지 않았다.';
const source = `이 자료는 기능 검증을 위해 만든 가상 연구 설명이다. ${findings} ${timing} ${scope} 유전체 분석 기반 감시체계와 분석 플랫폼의 고도화 방법도 검토했다. 감염병 진단법 평가 결과는 별도로 발표했다.`;
const research = title => ({
  kind:'research', source,
  draft:{
    title, summaries:['휴대형 장비를 이용한 유전자 검출법 개발'],
    lead:findings, paragraphs:[timing,scope],
    evidence:[{claim:findings,sourceQuote:findings}],
  },
});
const titleWarnings = report => report.warnings.filter(w => w.field === 'title');

test('existing stdio tool calls receive current headline guidance and review metadata', async()=>{
  const client=new Client({name:'kdca-headline-compatibility',version:'1'});
  const transport=new StdioClientTransport({
    command:process.execPath,args:['src/stdio.js'],
    cwd:new URL('..',import.meta.url).pathname,stderr:'pipe',
  });
  try {
    await client.connect(transport);
    const tools=(await client.listTools()).tools;
    assert.deepEqual(tools.map(t=>t.name).sort(),[
      'kdca_generate','kdca_get_artifact','kdca_guide','kdca_prepare','kdca_review',
    ]);
    assert.deepEqual(tools.find(t=>t.name==='kdca_prepare').inputSchema.required,['source']);
    assert.deepEqual(tools.find(t=>t.name==='kdca_review').inputSchema.required,['source','draft']);

    // An old client supplies only the original source/draft fields.
    const prepared=(await client.callTool({name:'kdca_prepare',arguments:{source}})).structuredContent;
    const guide=(await client.callTool({name:'kdca_guide',arguments:{}})).structuredContent;
    assert.equal(prepared.guide,guide.editorial);
    assert.match(prepared.guide,/## 제목 편집/);
    assert.match(prepared.guide,/후보 2~3개/);
    assert.equal(prepared.humanReviewRequired,true);
    assert.equal(guide.humanReviewRequired,true);
    assert.match(prepared.reviewNotice,/반드시 검토/);
    const prompt=await client.getPrompt({name:'kdca-write',arguments:{source}});
    assert.ok(prompt.messages.some(m=>m.content.text?.includes(prepared.guide)));

    const input=research('휴대형 분석기술 개발');
    const {kind,...legacyInput}=input;
    const reviewed=(await client.callTool({name:'kdca_review',arguments:legacyInput})).structuredContent;
    assert.equal(reviewed.passed,true);
    assert.ok(titleWarnings(reviewed).length>0);
    assert.equal(reviewed.humanReviewRequired,true);
    const made=await client.callTool({name:'kdca_generate',arguments:legacyInput});
    assert.ok(!made.isError,JSON.stringify(made.structuredContent));
    assert.deepEqual(made.structuredContent.review,reviewed);

    const artifact=await client.callTool({name:'kdca_get_artifact',arguments:{
      artifact_id:made.structuredContent.artifact_id,format:'review',
    }});
    const stored=JSON.parse(artifact.content[0].resource.text);
    assert.deepEqual(stored.review,reviewed);
  } finally {await client.close();}
});

test('necessary scientific terms are not a blacklist and clear titles remain intact', async()=>{
  for(const title of [
    '연구진, 유전자 검출법 개발',
    '감염병 진단법 평가 결과 발표',
    '유전체 분석 기반 감시체계 검토',
    '유전체 분석 플랫폼 고도화 방법 검토',
    '휴대형 장비를 이용한 분석법 개발',
  ]) {
    const input=research(title),before=structuredClone(input);
    const report=await portable('review',input);
    assert.equal(report.passed,true,title);
    assert.deepEqual(titleWarnings(report),[],title);
    assert.deepEqual(report.headlineReview.findingCodes,[],title);
    assert.equal(report.humanReviewRequired,true);
    assert.deepEqual(input,before);
  }
});

test('a specific modifier warning resolves when the equipment is named', async()=>{
  const vague=research('휴대형 분석기술 개발');
  const clearer=research('휴대형 장비를 이용한 분석법 개발');
  const before=await portable('review',vague);
  const after=await portable('review',clearer);
  const warning=titleWarnings(before).find(w=>w.code==='headline_modifier');
  assert.ok(warning);
  assert.match(warning.excerpt,/휴대형 분석기술/);
  assert.match(warning.message,/장비/);
  assert.match(warning.message,/원문/);
  assert.equal(before.passed,true);
  assert.equal(after.passed,true);
  assert.ok(!titleWarnings(after).some(w=>w.code===warning.code));
  assert.deepEqual(vague.draft.paragraphs,clearer.draft.paragraphs);
});

test('rhetorical and long headlines receive advice without becoming factual failures', async()=>{
  const rhetoric=await portable('review',research('유전자 분석의 새 지평을 여는 검사법 개발'));
  assert.equal(rhetoric.passed,true);
  assert.ok(titleWarnings(rhetoric).some(w=>w.code==='headline_abstract_claim'));

  const longTitle='연구진, 휴대형 장비를 이용한 유전자 검출법의 실험실 성능과 전처리 및 판독을 포함한 총 소요 시간, 현장 적용 가능성 평가 결과 발표';
  const long=await portable('review',research(longTitle));
  assert.equal(long.passed,true);
  const warning=titleWarnings(long).find(w=>w.code==='headline_length');
  assert.ok(warning);
  assert.match(warning.message,/요약/);
  assert.match(warning.message,/조건/);
});

test('generation preserves submitted content and keeps review notices out of the document', async()=>{
  const input=research('휴대형 분석기술 개발'),before=structuredClone(input);
  const report=await portable('review',input);
  const made=await portable('generate',input);
  assert.equal(made.ok,true);
  assert.deepEqual(made.review,report);
  assert.deepEqual(input,before);
  assert.equal(made.title,input.draft.title);
  assert.ok(made.markdown.startsWith('# '+input.draft.title+'\n'));
  for(const paragraph of input.draft.paragraphs)assert.ok(made.markdown.includes(paragraph));

  const zip=await JSZip.loadAsync(Buffer.from(made.hwpxBase64,'base64'));
  const documentText=[];
  for(const name of Object.keys(zip.files).filter(n=>/^Contents\/(?:section\d+|header)\.xml$/.test(n))) {
    const doc=new DOMParser().parseFromString(await zip.file(name).async('string'),'application/xml');
    documentText.push(...Array.from(doc.getElementsByTagNameNS('http://www.hancom.co.kr/hwpml/2011/paragraph','t'),n=>n.textContent));
  }
  assert.ok(documentText.includes(input.draft.title));
  // HWPX keeps the reference template's leading paragraph indentation.
  for(const paragraph of input.draft.paragraphs)assert.ok(documentText.some(t=>t.trim()===paragraph));
  for(const content of [made.markdown,made.html,documentText.join('\n')]) {
    assert.ok(!content.includes(report.reviewNotice));
    assert.doesNotMatch(content,/AI는 보도자료|사용 전 필수 검토|자동 검사 통과/);
  }
});

test('headline advice does not bypass existing numeric, unit or evidence errors', async()=>{
  const base=JSON.parse(await readFile(new URL('../examples/statistics.json',import.meta.url),'utf8'));
  for(const [change,code] of [
    [d=>{d.title='휴대형 분석기술로 99999건 확인';},'unsupported_numbers'],
    [d=>{d.title='내성률 1.0% 상승';},'changed_units'],
    [d=>{d.evidence[0].sourceQuote='원문에 존재하지 않는 근거 문장';},'evidence_not_in_source'],
  ]) {
    const input=structuredClone(base);
    change(input.draft);
    const result=await portable('generate',input);
    assert.equal(result.ok,false);
    assert.equal(result.review.passed,false);
    assert.ok(result.review.errors.some(e=>e.code===code),code);
    assert.equal(result.hwpxBase64,undefined);
    assert.equal(result.review.humanReviewRequired,true);
  }
});

test('semantic scope must be reviewed even when words and numbers exist in the source', async()=>{
  const cases=[
    ['유전자 검사로 환자 확진',/유전자 검출과 환자 확진/],
    ['전처리부터 판독까지 22분 만에 확인',/총 소요 시간과 특정 반응 시간/],
    ['유전자 검출법, 현장 적용 완료',/개발과 현장 적용/],
  ];
  for(const [title,check] of cases) {
    const report=await portable('review',research(title));
    // These are deliberately misleading headlines. This test verifies the
    // review obligation, not that limited pattern checks can prove them true.
    // Do not require passed=true: future semantic checks may reject more cases.
    assert.equal(report.humanReviewRequired,true);
    assert.match(report.headlineReview.checks.join('\n'),check);
    assert.match(report.headlineReview.instruction,/원문/);
    assert.match(report.headlineReview.instruction,/조건·확정 수준/);
    assert.match(report.reviewNotice,/정확성 또는 배포 승인을 뜻하지 않습니다/);
    assert.match(report.limitations,/규칙 기반 보조 검사/);
  }
});
