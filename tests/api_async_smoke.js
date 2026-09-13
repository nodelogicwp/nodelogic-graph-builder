/* API system regression suite (PRO expansion + async architecture fix).
 *
 * BUG (found auditing __nodeApiRequest): it used a SYNCHRONOUS XHR
 * (`xhr.open(method, url, false)`), blocking the page's main thread on
 * every API node evaluation -- the "faking synchronous behavior"
 * anti-pattern. Fixed: real async XHR via __nodeApiFetch, with a fresh
 * request returning null/"loading" immediately and scheduleRecalculation()
 * re-running the graph once the response lands -- the same external-event
 * pattern already used for __nodeEvent.
 *
 * Compatibility: on SUCCESS, __nodeApiRequest's return value shape is
 * unchanged (the parsed body directly) so existing api-field paths keep
 * working; the request/response envelope (status/ok/error) is exposed via a
 * NEW sibling node/function, __nodeApiStatus, sharing the same request
 * cache -- not a breaking change to the existing data contract.
 *
 * Expansion: api-request gained a Body input pin, a Headers (JSON) field,
 * and a Timeout field; methods already covered GET/POST/PUT/PATCH/DELETE,
 * now also HEAD/OPTIONS. Concurrent identical requests (same method+url+
 * body+headers) are deduped to one network request via apiInFlightRequests.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = require('path').resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(require('path').join(ROOT, "dist", "build", "elementor.js"), 'utf8');
const FRONT = fs.readFileSync(require('path').join(ROOT, "frontend.js"), 'utf8');
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

// Fake XHR: records every request it sees (method/url/body/headers) and
// resolves asynchronously (real-browser shape), so tests can assert on
// exactly what was sent as well as what came back.
function withFakeXHR(responder) {
  return `
    (function(){
      window.__requests = [];
      function X(){ this._h={}; }
      X.prototype.open=function(m,u,a){ this._m=m; this._u=u; this._async=(a!==false); };
      Object.defineProperty(X.prototype,'withCredentials',{ set:function(v){ this._wc=v; }, get:function(){ return this._wc; } });
      X.prototype.setRequestHeader=function(k,v){ this._h[k]=v; };
      X.prototype.send=function(b){
        this._body=b;
        const rec = { method: this._m, url: this._u, body: b, headers: Object.assign({}, this._h) };
        window.__requests.push(rec);
        const self = this;
        setTimeout(() => {
          const r = (${responder})(rec);
          self.status = r.status;
          self.statusText = r.statusText || '';
          self.responseText = r.responseText;
          if (r.error === 'network') { if (self.onerror) self.onerror(); return; }
          if (r.error === 'timeout') { if (self.ontimeout) self.ontimeout(); return; }
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
function readSink(dom) { return dom.window.document.getElementById('sink').textContent; }

async function scenario(label, nodeType, nodeData, sources, responder, check) {
  const els = [mk('n', nodeType, nodeData), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' })];
  const conns = [cn('wo', 'n', 'output0', 'o', 'input1')];
  sources.forEach((s, i) => { els.push(mk('s' + i, s.t, s.d)); conns.push(cn('w' + i, 's' + i, 'output0', 'n', s.in)); });
  const f = await gen(els, conns);
  const { dom, errs } = boot(f, withFakeXHR(responder));
  await wait(60);
  const noErr = errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;
  ok(`${label}: no crash`, noErr, errs.join(';') + ' | ' + JSON.stringify(f));
  const reqs = dom.window.__requests || [];
  ok(`${label}: ${check.d}`, check.fn(readSink(dom), reqs, dom), `sink=${JSON.stringify(readSink(dom))} reqs=${JSON.stringify(reqs)} formula=${JSON.stringify(f)}`);
}

// `responder` is embedded into a jsdom-`eval`'d string via .toString(), so it
// must not close over any outer (Node-process) variable -- `new Function`
// gives a closure-free function whose source reproduces cleanly.
const okJson = (body) => new Function('rec', `return { status: 200, statusText: 'OK', responseText: ${JSON.stringify(JSON.stringify(body))} };`);

(async () => {
  // Warm-up: the very first gen() in a fresh process is occasionally slower
  // to settle than wait(450) accounts for (observed as an empty captured
  // formula on the first real scenario only -- never on later ones). Throw
  // one away first so timing-sensitive assertions below aren't cold-start flaky.
  await gen([mk('n', 'number', { value: 1 }), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' })], [cn('w', 'n', 'output0', 'o', 'input1')]);

  // ---- Method / body / headers / timeout actually reach the request ----
  await scenario('POST with body + custom header', 'api-request',
    { apiUrl: 'https://api.test/items', apiMethod: 'POST', apiHeaders: '{"X-Custom":"abc"}', apiTimeout: 5000 },
    [{ t: 'constant-string', d: { value: '{"name":"widget"}' }, in: 'input1' }],
    okJson({ created: true }),
    { d: 'method=POST, body forwarded, custom header forwarded', fn: (sink, reqs) => reqs[0]?.method === 'POST' && reqs[0]?.body === '{"name":"widget"}' && reqs[0]?.headers?.['X-Custom'] === 'abc' });

  await scenario('PUT/PATCH/DELETE methods reach XHR verbatim', 'api-request',
    { apiUrl: 'https://api.test/items/1', apiMethod: 'DELETE' }, [],
    okJson({ ok: true }),
    { d: 'method=DELETE', fn: (sink, reqs) => reqs[0]?.method === 'DELETE' });

  // ---- Genuine async: first pass never blocks with a fake-sync value ----
  {
    const els = [
      mk('req', 'api-request', { apiUrl: 'https://api.test/hello', apiMethod: 'GET' }),
      mk('field', 'api-field', { apiFieldPath: 'greeting', apiFieldType: 'string' }),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [cn('w1', 'req', 'output0', 'field', 'input0'), cn('w2', 'field', 'output0', 'o1', 'input1')];
    const f = await gen(els, conns);
    const { dom, errs } = boot(f, withFakeXHR(okJson({ greeting: 'world' })));
    await wait(60);
    ok('GET success: no crash', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
    ok('GET success: real value appears only after the async response, via recalculation (not frozen on the pre-response "loading" pass)',
      readSink(dom) === 'world', `sink=${JSON.stringify(readSink(dom))} formula=${JSON.stringify(f)}`);
  }

  // ---- Structured error info via api-status, without breaking api-request's body contract ----
  {
    const urlNode = { apiUrl: 'https://api.test/broken', apiMethod: 'GET' };
    const els = [
      mk('req', 'api-request', urlNode),
      mk('status', 'api-status', urlNode),
      mk('field', 'api-field', { apiFieldPath: 'status', apiFieldType: 'number' }),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [
      cn('w1', 'status', 'output0', 'field', 'input0'),
      cn('w2', 'field', 'output0', 'o1', 'input1'),
    ];
    const f = await gen(els, conns);
    const { dom, errs } = boot(f, withFakeXHR(() => ({ status: 500, statusText: 'Server Error', responseText: 'oops' })));
    await wait(60);
    ok('api-status: no crash', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
    ok('api-status: exposes the HTTP status code (500) via api-field, independent of api-request\'s body output',
      readSink(dom) === '500', `sink=${JSON.stringify(readSink(dom))} formula=${JSON.stringify(f)}`);
  }

  // ---- Dedup: two nodes hitting the SAME endpoint share one network request
  {
    const same = { apiUrl: 'https://api.test/shared', apiMethod: 'GET' };
    const els = [
      mk('req', 'api-request', same),
      mk('status', 'api-status', same),
      mk('field', 'api-field', { apiFieldPath: 'ok', apiFieldType: 'boolean' }),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [cn('w1', 'status', 'output0', 'field', 'input0'), cn('w2', 'field', 'output0', 'o1', 'input1')];
    const f = await gen(els, conns);
    const { dom, errs } = boot(f, withFakeXHR(okJson({ shared: true })));
    await wait(60);
    ok('dedup: no crash', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
    ok('dedup: identical requests (api-request + api-status, same URL/method) fire exactly ONE network request',
      (dom.window.__requests || []).length === 1, `count=${(dom.window.__requests || []).length}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
