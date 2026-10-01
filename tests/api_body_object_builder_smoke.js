/* Regression test for API Request body construction.
 *
 * Gap: API Request's Body input (pin index 1) already accepted a wired
 * 'zip' (generic structured-object) value and __nodeApiSerializeBody
 * (frontend.js) already JSON.stringify's it correctly -- but there was no
 * PRO-independent, always-available graph node to actually BUILD such an
 * object from other graph values. The only existing zip-object producer
 * (`custom-node` in "Zip Output" mode) requires a PRO-configured custom node
 * template to even exist on the palette.
 *
 * Fix: a new, generic `object-build` node (PRO palette entry "Object
 * Builder", compiler support in MAIN) with a dynamic 1-8 key count and a
 * per-pin key-name field, mirroring multi-concat's dynamic-input-count UI
 * and the existing "Output Labels" per-pin-name pattern. It reuses the
 * existing 'zip' value type end to end -- no new runtime function, no
 * API-specific hack.
 *
 * This test wires string, number, and boolean sources into an Object
 * Builder, wires its output into API Request's Body pin, sends a real
 * (faked) POST, and verifies the exact JSON body sent -- then feeds the
 * (echoed) response back through the existing API Field node to confirm
 * response parsing is unaffected.
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

// Same fake-XHR harness as tests/api_async_smoke.js: records every request
// it sees and echoes the sent body back as the JSON response, so this test
// can verify both what was SENT and that a subsequent api-field read of the
// (echoed) response still works.
function withFakeXHREcho() {
  return `
    (function(){
      window.__requests = [];
      function X(){ this._h={}; }
      X.prototype.open=function(m,u,a){ this._m=m; this._u=u; };
      Object.defineProperty(X.prototype,'withCredentials',{ set:function(v){}, get:function(){ return false; } });
      X.prototype.setRequestHeader=function(k,v){ this._h[k]=v; };
      X.prototype.send=function(b){
        this._body=b;
        window.__requests.push({ method: this._m, url: this._u, body: b, headers: Object.assign({}, this._h) });
        const self = this;
        setTimeout(() => {
          self.status = 200;
          self.responseText = (typeof b === 'string' && b.length) ? b : '{}';
          if (self.onload) self.onload();
        }, 0);
      };
      window.XMLHttpRequest = X;
    })();
  `;
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

(async () => {
  // Object Builder: title (string), body (string), userId (number),
  // active (boolean) -- wired into API Request's Body pin (input1).
  const els = [
    mk('ob', 'object-build', { inputCount: 4, objectKeys: ['title', 'body', 'userId', 'active'] }),
    mk('s0', 'constant-string', { value: 'NodeLogic Test' }),
    mk('s1', 'constant-string', { value: 'API POST is working' }),
    mk('s2', 'number', { value: 99 }),
    mk('s3', 'constant-boolean', { value: true }),
    mk('req', 'api-request', { apiUrl: 'https://jsonplaceholder.typicode.com/posts', apiMethod: 'POST' }),
    mk('field', 'api-field', { apiFieldPath: 'title', apiFieldType: 'string' }),
    mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
  ];
  const conns = [
    cn('c0', 's0', 'output0', 'ob', 'input0'),
    cn('c1', 's1', 'output0', 'ob', 'input1'),
    cn('c2', 's2', 'output0', 'ob', 'input2'),
    cn('c3', 's3', 'output0', 'ob', 'input3'),
    cn('cb', 'ob', 'output0', 'req', 'input1'), // Object Builder -> API Request Body pin
    cn('cr', 'req', 'output0', 'field', 'input0'),
    cn('cf', 'field', 'output0', 'o', 'input1'),
  ];

  const formula = await gen(els, conns);
  ok('editor produced a formula', !!formula, formula);

  const { dom, errs } = boot(formula, withFakeXHREcho());
  await wait(120);

  const noErr = errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;
  ok('no runtime error', noErr, errs.join(';') + ' | formula=' + JSON.stringify(formula));

  const reqs = dom.window.__requests || [];
  ok('exactly one POST request was sent', reqs.length === 1 && reqs[0].method === 'POST', JSON.stringify(reqs));

  let sentBody = null;
  try { sentBody = JSON.parse(reqs[0]?.body || 'null'); } catch (e) { /* leave null, asserted below */ }
  ok('request body is valid JSON', sentBody !== null, reqs[0]?.body);
  ok('body has the correct string property "title"', sentBody?.title === 'NodeLogic Test', JSON.stringify(sentBody));
  ok('body has the correct string property "body"', sentBody?.body === 'API POST is working', JSON.stringify(sentBody));
  ok('body has the correct number property "userId"', sentBody?.userId === 99, JSON.stringify(sentBody));
  ok('body has the correct boolean property "active"', sentBody?.active === true, JSON.stringify(sentBody));

  ok('response parsing (API Field) still works on the echoed response', readSink(dom) === 'NodeLogic Test', readSink(dom));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
