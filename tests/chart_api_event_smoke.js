/* Priorities 2-4: chart-data (renderChartBlock), API nodes, event nodes —
 * runtime audit via real frontend.js with mocked endpoints. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = require('path').resolve(__dirname, '..');
const FRONT = fs.readFileSync(require('path').join(ROOT, "frontend.js"), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 60000);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function loadFrontend(bodyHtml, preScript) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}</body>`, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
  dom.window.eval(CSSP);
  // jsdom has no requestAnimationFrame; __nodeApiFetch's async completion
  // calls scheduleRecalculation() -> requestAnimationFrame. Polyfill it as a
  // macrotask (see tests/event_repeat_execution_smoke.js) instead of letting
  // it throw uncaught.
  let rafId = 1;
  dom.window.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(dom.window.performance.now()), 0); return id; };
  dom.window.cancelAnimationFrame = () => {};
  if (preScript) dom.window.eval(preScript);
  const errs = []; dom.window.addEventListener('error', (e) => errs.push(e.message));
  const oce = dom.window.console.error; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  let src = FRONT; const m = '\n})();'; const i = src.lastIndexOf(m);
  src = src.slice(0, i) + '\n;window.__T={renderChartBlock:renderChartBlock,collectChartRecords:collectChartRecords,__nodeApiRequest:__nodeApiRequest,__nodeApiStatus:__nodeApiStatus,safeEvaluateExpression:safeEvaluateExpression,__nodeGetPath:__nodeGetPath,__nodeApiListMapper:__nodeApiListMapper};' + src.slice(i);
  const s = dom.window.document.createElement('script'); s.textContent = src; dom.window.document.body.appendChild(s);
  return { dom, errs };
}

/* ============ Priority 2: chart-data ================================= */
{
  const { dom, errs } = loadFrontend(`<div id="chart" data-nodelogic-chart="1" class="nodelogic-chart"><div data-nodelogic-chart-canvas></div></div>`);
  const T = dom.window.__T;
  const block = dom.window.document.getElementById('chart');
  const cases = [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['empty array', []],
    ['empty object', {}],
    ['scalar number', 42],
    ['scalar string', 'hi'],
    ['array of {label,value}', [{ label: 'Q1', value: 10 }, { label: 'Q2', value: 20 }]],
    ['array of scalars', [1, 2, 3]],
    ['single {label,value}', { label: 'Only', value: 5 }],
    ['malformed: label is object, value is array', [{ label: { x: 1 }, value: [1, 2] }]],
    ['NaN / Infinity values', [{ label: 'a', value: NaN }, { label: 'b', value: Infinity }, { label: 'c', value: -Infinity }]],
    ['missing value key', [{ label: 'x' }]],
    ['missing label key', [{ value: 7 }]],
    ['null items in array', [null, { label: 'ok', value: 3 }, undefined]],
    ['deeply nested garbage', { value: { data: { results: [{ label: 'n', value: '9' }] } } }],
    ['huge array (500)', Array.from({ length: 500 }, (_, i) => ({ label: 'i' + i, value: i }))],
    ['string number values', [{ label: 'a', value: '3.5' }, { label: 'b', value: 'not a number' }]],
    ['circular-ish (object with self key names)', { label: 'value', value: 'label' }],
  ];
  for (const [name, val] of cases) {
    let threw = null;
    try { T.renderChartBlock(block, val); } catch (e) { threw = e.message; }
    ok(`chart: renderChartBlock(${name}) does not throw`, !threw, threw);
    ok(`chart: renderChartBlock(${name}) produced markup`, block.querySelector('[data-nodelogic-chart-canvas]').innerHTML.length > 0, 'empty');
  }
  // collectChartRecords sanity
  ok('chart: records from array-of-objects have finite numeric value', (() => {
    const r = T.collectChartRecords([{ label: 'a', value: 'x' }, { label: 'b', value: 5 }], block);
    return r.every((rec) => Number.isFinite(rec.value)) && typeof r[0].label === 'string';
  })());
  ok('chart: no runtime errors during chart cases', errs.filter((e) => /Cannot read|is not a function|SyntaxError/i.test(e)).length === 0, errs.join(' | '));
}

/* ============ Priority 3: API nodes (mocked XHR, real async) ========= */
// __nodeApiRequest fires a genuine async XHR now (was synchronous). The mock
// mirrors that: send() resolves on a later macrotask via onload/onerror/
// ontimeout, exactly like a real browser XHR.
function withFakeXHR(status, responseText, opts) {
  opts = opts || {};
  return `
    (function(){
      function X(){ this._h={}; }
      X.prototype.open=function(m,u,a){ this._m=m; this._u=u; this._async=(a!==false); window.__lastXHR=this; };
      Object.defineProperty(X.prototype,'withCredentials',{ set:function(v){ this._wc=v; }, get:function(){ return this._wc; } });
      X.prototype.setRequestHeader=function(k,v){ ${opts.throwHeader ? 'throw new Error("InvalidStateError");' : 'this._h[k]=v;'} };
      X.prototype.send=function(b){
        this._body=b;
        setTimeout(() => {
          ${opts.networkError ? 'if (this.onerror) this.onerror(); return;' : ''}
          ${opts.timeout ? 'if (this.ontimeout) this.ontimeout(); return;' : ''}
          this.status=${status};
          this.statusText=${JSON.stringify(opts.statusText || '')};
          this.responseText=${JSON.stringify(responseText)};
          if (this.onload) this.onload();
        }, 0);
      };
      window.XMLHttpRequest = X;
      window.wpApiSettings = { nonce: 'NONCE123' };
    })();
  `;
}
async function apiTest(label, status, body, opts, check) {
  const { dom, errs } = loadFrontend('<div></div>', withFakeXHR(status, body, opts));
  const T = dom.window.__T;
  let first, threw = null;
  try { first = T.__nodeApiRequest('https://site.test/wp-json/x', 'GET'); } catch (e) { threw = e.message; }
  ok(`api: ${label} does not throw`, !threw, threw);
  ok(`api: ${label} first (in-flight) call returns null, not fake-sync body`, first === null, `first=${JSON.stringify(first)}`);
  await wait(30);
  const res = T.__nodeApiRequest('https://site.test/wp-json/x', 'GET');
  ok(`api: ${label} -> ${check.d}`, check.fn(res, dom.window.__lastXHR), `res=${JSON.stringify(res)}`);
  ok(`api: ${label} no console error`, errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
  return { dom, res };
}
async function runApiTests() {
  await apiTest('200 valid JSON object', 200, '{"a":1,"b":"x"}', {}, { d: 'parsed object', fn: (r) => r && r.a === 1 && r.b === 'x' });
  await apiTest('200 valid JSON array', 200, '[1,2,3]', {}, { d: 'parsed array', fn: (r) => Array.isArray(r) && r.length === 3 });
  await apiTest('200 empty body', 200, '', {}, { d: 'null / empty-safe', fn: (r) => r === null || r === '' || r === undefined });
  await apiTest('200 malformed JSON', 200, '{not json', {}, { d: 'returns raw string or null, no throw', fn: (r) => r === null || typeof r === 'string' });
  await apiTest('404', 404, '{"error":"nf"}', {}, { d: 'null on HTTP error', fn: (r) => r === null });
  await apiTest('500', 500, 'Server Error', {}, { d: 'null on 5xx', fn: (r) => r === null });
  await apiTest('200 plain string body', 200, 'hello', {}, { d: 'string passthrough or null', fn: (r) => r === 'hello' || r === null });
  await apiTest('network error', 0, '', { networkError: true }, { d: 'null on network error, no throw', fn: (r) => r === null });
  await apiTest('timeout', 0, '', { timeout: true }, { d: 'null on timeout, no throw/hang', fn: (r) => r === null });
  // nonce sent for same-origin GET? our finalUrl appends _t; header set best-effort
  {
    const { dom } = await apiTest('nonce header attempted for same-origin', 200, '{"ok":1}', {}, { d: 'X-WP-Nonce present or absent w/o crash', fn: (r) => r && r.ok === 1 });
    const xhr = dom.window.__lastXHR;
    ok('api: same-origin request carried X-WP-Nonce header', xhr && xhr._h && xhr._h['X-WP-Nonce'] === 'NONCE123', JSON.stringify(xhr && xhr._h));
  }
  // api-list-mapper with array vs object vs garbage
  {
    const { dom } = loadFrontend('<div></div>');
    const T = dom.window.__T;
    ok('api-list-mapper: array of objects', (() => { try { const r = T.__nodeApiListMapper([{ n: 'A', v: 1 }, { n: 'B', v: 2 }], '', 'n', 'v', 'auto', 'string', '', []); return Array.isArray(r); } catch { return false; } })());
    ok('api-list-mapper: object (not array)', (() => { try { const r = T.__nodeApiListMapper({ items: [{ n: 'A', v: 1 }] }, 'items', 'n', 'v', 'auto', 'string', '', []); return Array.isArray(r); } catch { return false; } })());
    ok('api-list-mapper: null/garbage -> array (no throw)', (() => { try { return Array.isArray(T.__nodeApiListMapper(null, '', 'label', 'value', 'auto', 'string', '', [])); } catch { return false; } })());
    ok('api-list-mapper: string input -> no throw', (() => { try { T.__nodeApiListMapper('nope', '', 'label', 'value', 'auto', 'string', '', []); return true; } catch { return false; } })());
    ok('__nodeGetPath: missing path -> fallback', T.__nodeGetPath({ a: { b: 1 } }, 'a.x.y', 'FB') === 'FB');
    ok('__nodeGetPath: array index', T.__nodeGetPath({ items: [{ v: 9 }] }, 'items.0.v', 0) === 9);
    ok('__nodeGetPath: null source -> fallback', T.__nodeGetPath(null, 'a.b', 'FB') === 'FB');
  }
}
const apiTestsDone = runApiTests();

/* ============ Priority 4: event nodes (listener leak / dup) ========= */
{
  // Build a page with an element + logic block whose formula uses __nodeEvent,
  // run init twice / mutate DOM, count listeners via a wrapped addEventListener.
  const html = `<button id="btn">go</button>
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div>`;
  const pre = `
    window.__listenerCounts = {};
    (function(){
      var proto = window.EventTarget.prototype;
      var orig = proto.addEventListener;
      proto.addEventListener = function(type){
        try { var k=(this.id?('#'+this.id):this.nodeName)+':'+type; window.__listenerCounts[k]=(window.__listenerCounts[k]||0)+1; } catch(e){}
        return orig.apply(this, arguments);
      };
    })();
  `;
  const { dom, errs } = loadFrontend(html, pre);
  const doc = dom.window.document;
  // formula: on button click, set #btn text — using __nodeEvent + an action
  doc.getElementById('lb').setAttribute('data-formula',
    `({ "btn": { "value": __nodeEvent("btn", "click"), actions: [ { type: "setText", value: "clicked" } ] } })`);
  doc.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  const c1 = { ...dom.window.__listenerCounts };
  // simulate a re-init attempt (guarded by sliderCalculatorInitialized) + a recalc via input event
  doc.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  // dispatch several clicks
  for (let i = 0; i < 5; i++) doc.getElementById('btn').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  const c2 = { ...dom.window.__listenerCounts };
  ok('event: init is idempotent (no unbounded listener growth on #btn:click)',
    (c2['#btn:click'] || 0) <= (c1['#btn:click'] || 0) + 1, `c1=${c1['#btn:click']} c2=${c2['#btn:click']}`);
  ok('event: no runtime error binding/firing events', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
  // DOM replacement: swap the button node, re-run recalc — must not throw
  const nb = doc.createElement('button'); nb.id = 'btn'; nb.textContent = 'go2';
  doc.getElementById('btn').replaceWith(nb);
  let threw = null;
  try { dom.window.dispatchEvent(new dom.window.Event('resize')); nb.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); } catch (e) { threw = e.message; }
  ok('event: DOM replacement of the bound element does not throw', !threw, threw);
}

apiTestsDone.then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
});
