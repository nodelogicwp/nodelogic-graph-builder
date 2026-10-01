/* Regression test for the `json-body` node ("JSON Body" in PRO's API Nodes
 * palette folder).
 *
 * Design: the user pastes/types raw JSON into a large sidebar textarea; the
 * compiler embeds that text as a single, safely-escaped STRING literal (no
 * computed-bracket syntax, avoiding the [identifier]-collision bug found
 * while building `object-build`) and calls a new, tiny runtime helper,
 * __nodeJsonParse(text) (frontend.js), which is just `JSON.parse` wrapped in
 * a try/catch returning `null` on failure/empty input -- producing the
 * graph's ordinary, generic structured value (a real JS object/array/
 * string/number/boolean/null), not a wrapped type and not an API-specific
 * serializer. Output is tagged 'zip', identical to Object Builder, so it
 * wires into API Request's Body pin exactly the same way; the EXISTING
 * __nodeApiSerializeBody (unchanged) does the actual JSON.stringify at
 * request time, and its pre-existing `data ?? {}` fallback already turns a
 * failed parse (null) into a safe "{}" body -- no new API-specific handling.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const FRONT = fs.readFileSync(path.join(ROOT, 'frontend.js'), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 60000);

function makeWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
async function gen(elements, connections) {
  const w = makeWindow();
  const fcalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(450);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  if (b) b.click();
  await wait(250);
  return fcalls[fcalls.length - 1];
}
function boot(formula, preScript) {
  const dom = new JSDOM(`<!doctype html><body><div id="sink">START</div>
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
  dom.window.eval(CSSP);
  let rafId = 1;
  dom.window.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(dom.window.performance.now()), 0); return id; };
  dom.window.cancelAnimationFrame = () => {};
  if (preScript) dom.window.eval(preScript);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { dom, errs };
}
const readSink = (dom) => dom.window.document.getElementById('sink').textContent;

// Output only special-cases ARRAYS for display (JSON.stringify); a plain
// object falls back to bare String(obj) = "[object Object]" -- that's a
// pre-existing, correct property of Output, not something this node should
// work around. So parsing correctness (including real navigability into
// nested objects/arrays -- proving this is a genuine structured value, not
// a string) is verified via __nodeGetPath, exactly how api-field/GetPath
// already consumes any 'zip' value elsewhere in the graph. This still goes
// through the REAL __nodeJsonParse runtime function (same registration
// paths: isPreparedExpressionSafe whitelist + createFormulaEvalContext).
async function parseScenario(label, jsonBodyText, path, expectedDisplay) {
  const f = `({ " nlOutTarget:o": { "__targetId": "sink", "value": __nodeToString(__nodeGetPath(__nodeJsonParse(${JSON.stringify(jsonBodyText)}), ${JSON.stringify(path)}, "MISSING")) } })`;
  const { dom, errs } = boot(f);
  await wait(60);
  const noErr = errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;
  ok(`${label}: no crash`, noErr, errs.join(';') + ' | formula=' + f);
  ok(`${label}: ${path || '(root)'} -> ${expectedDisplay}`, readSink(dom) === expectedDisplay, `sink=${JSON.stringify(readSink(dom))} formula=${f}`);
}

function withFakeXHREcho() {
  return `
    (function(){
      window.__requests = [];
      function X(){ this._h={}; }
      X.prototype.open=function(m,u,a){ this._m=m; this._u=u; };
      Object.defineProperty(X.prototype,'withCredentials',{ set:function(v){}, get:function(){ return false; } });
      X.prototype.setRequestHeader=function(k,v){ this._h[k]=v; };
      X.prototype.send=function(b){
        window.__requests.push({ method: this._m, url: this._u, body: b });
        const self = this;
        setTimeout(() => { self.status = 200; self.responseText = '{}'; if (self.onload) self.onload(); }, 0);
      };
      window.XMLHttpRequest = X;
    })();
  `;
}

(async () => {
  // 1) Simple object
  await parseScenario('simple object', '{"title": "NodeLogic Test"}', 'title', 'NodeLogic Test');

  // 2) string + number + boolean
  const mixed = '{"title": "NodeLogic Test", "userId": 99, "active": true}';
  await parseScenario('string property', mixed, 'title', 'NodeLogic Test');
  await parseScenario('number property', mixed, 'userId', '99');
  await parseScenario('boolean property', mixed, 'active', 'true');

  // 3) nested object
  await parseScenario('nested object', '{"user": {"id": 99, "active": true}}', 'user.id', '99');

  // 4) array (both via GetPath navigation and via Output's own array-display
  // special-case, proving it's a real array, not a string containing "[...]")
  await parseScenario('array (navigated)', '{"tags": ["api", "test"]}', 'tags.1', 'test');
  {
    const f = `({ " nlOutTarget:o": { "__targetId": "sink", "value": __nodeGetPath(__nodeJsonParse(${JSON.stringify('{"tags": ["api", "test"]}')}), "tags", []) } })`;
    const { dom, errs } = boot(f);
    await wait(60);
    ok('array (displayed): no crash', errs.length === 0, errs.join(';'));
    ok('array (displayed): Output shows a real JSON array, not "[object Object]"', readSink(dom) === '["api","test"]', readSink(dom));
  }

  // 5) nested object + array + null + float (the full example from the spec)
  const full = JSON.stringify({
    title: 'Test', user: { id: 99, active: true }, tags: ['api', 'test'], meta: { score: 12.5 }, note: null,
  });
  await parseScenario('nested+array+float: title', full, 'title', 'Test');
  await parseScenario('nested+array+float: user.active', full, 'user.active', 'true');
  await parseScenario('nested+array+float: tags.0', full, 'tags.0', 'api');
  await parseScenario('nested+array+float: meta.score (preserves float)', full, 'meta.score', '12.5');

  // 6+7) Connect to API Request Body, verify exact JSON payload sent
  {
    const els = [
      mk('body', 'json-body', { jsonBodyText: '{"title":"NodeLogic Test","body":"API POST is working","userId":99}' }),
      mk('req', 'api-request', { apiUrl: 'https://jsonplaceholder.typicode.com/posts', apiMethod: 'POST' }),
      mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [
      cn('c0', 'body', 'output0', 'req', 'input1'), // JSON Body -> API Request Body pin
      cn('c1', 'req', 'output0', 'o', 'input1'),
    ];
    const f = await gen(els, conns);
    const { dom, errs } = boot(f, withFakeXHREcho());
    await wait(100);
    const noErr = errs.filter((e) => /Cannot read|is not a function|SyntaxError|not safe/i.test(e)).length === 0;
    ok('API Request Body: no crash', noErr, errs.join(';') + ' | formula=' + f);
    const reqs = dom.window.__requests || [];
    ok('API Request Body: exactly one POST request sent', reqs.length === 1 && reqs[0].method === 'POST', JSON.stringify(reqs));
    let sentBody = null;
    try { sentBody = JSON.parse(reqs[0]?.body || 'null'); } catch (e) { /* asserted below */ }
    ok('API Request Body: exact JSON payload sent', JSON.stringify(sentBody) === JSON.stringify({ title: 'NodeLogic Test', body: 'API POST is working', userId: 99 }), reqs[0]?.body);
  }

  // 6b) null / nested / array all survive the round trip through the actual
  // serialization path (__nodeApiSerializeBody) byte-for-byte, including a
  // `null` value staying JSON `null` (not the string "null" or dropped).
  {
    const nestedBody = { title: 'Test', user: { id: 99, active: true }, tags: ['api', 'test'], meta: { score: 12.5 }, note: null };
    const f = `({ " nlOutTarget:o": { "__targetId": "sink", "value": __nodeToString(__nodeApiRequest("https://api.test/echo", "POST", __nodeJsonParse(${JSON.stringify(JSON.stringify(nestedBody))}), "", 15000)) } })`;
    const { dom, errs } = boot(f, withFakeXHREcho());
    await wait(100);
    ok('nested/array/null round trip: no crash', errs.length === 0, errs.join(';'));
    const reqs = dom.window.__requests || [];
    ok('nested/array/null round trip: request sent', reqs.length === 1, JSON.stringify(reqs));
    ok('nested/array/null round trip: exact byte-for-byte JSON (including null)', reqs[0]?.body === JSON.stringify(nestedBody), reqs[0]?.body);
  }

  // 8) Invalid JSON fails safely (no crash; API body degrades to "{}")
  {
    const els = [
      mk('body', 'json-body', { jsonBodyText: '{not valid json!!!' }),
      mk('req', 'api-request', { apiUrl: 'https://api.test/x', apiMethod: 'POST' }),
      mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [
      cn('c0', 'body', 'output0', 'req', 'input1'),
      cn('c1', 'req', 'output0', 'o', 'input1'),
    ];
    const f = await gen(els, conns);
    const { dom, errs } = boot(f, withFakeXHREcho());
    await wait(100);
    const noErr = errs.filter((e) => /Cannot read|is not a function|SyntaxError|not safe/i.test(e)).length === 0;
    ok('invalid JSON: no crash / no uncaught exception', noErr, errs.join(';') + ' | formula=' + f);
    const reqs = dom.window.__requests || [];
    ok('invalid JSON: request still sent (fails safely)', reqs.length === 1, JSON.stringify(reqs));
    ok('invalid JSON: body degrades to "{}" (existing __nodeApiSerializeBody fallback)', reqs[0]?.body === '{}', reqs[0]?.body);
  }

  // Also: empty JSON Body text (never touched) must not crash, and parses
  // to null (not a thrown error, not an empty string standing in for JSON).
  {
    const f = `({ " nlOutTarget:o": { "__targetId": "sink", "value": ((__nodeJsonParse("") === null) ? "IS_NULL" : "NOT_NULL") } })`;
    const { dom, errs } = boot(f);
    await wait(60);
    ok('empty text: no crash', errs.length === 0, errs.join(';'));
    ok('empty text -> null', readSink(dom) === 'IS_NULL', readSink(dom));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
