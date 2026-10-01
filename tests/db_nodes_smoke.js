/* End-to-end (editor compile -> live runtime) for PRO Database nodes, with a
 * fake XMLHttpRequest standing in for the PRO REST endpoint.
 *
 * What is proven here is the BROWSER half of the security model: the
 * compiled formula never describes the query (no table / column / operator
 * text ever reaches the page -- only node ids and runtime values), SELECT is
 * cached like API Request, and writes fire exactly once per genuine Trigger
 * event, never on recalculation. The SERVER half (signature, allowlist,
 * parameterized SQL, WHERE rules) is covered by the PRO plugin's
 * tests/db-security-test.php.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const FRONT = fs.readFileSync(path.join(ROOT, 'frontend.js'), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 120000);

function makeEditorWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
async function compile(elements, connections) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const w = makeEditorWindow();
    const fcalls = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
      onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
    });
    await wait(attempt === 0 ? 550 : 1300);
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(attempt === 0 ? 350 : 800);
    const f = fcalls[fcalls.length - 1];
    if (f) return f;
  }
  return '';
}

// Fake XHR: every request is recorded; `responder` (page-side source) decides the reply.
function fakeXhr(responderSource) {
  return `
    (function(){
      window.__requests = [];
      function X(){ this._h = {}; }
      X.prototype.open = function(m, u){ this._m = m; this._u = u; };
      X.prototype.setRequestHeader = function(k, v){ this._h[k] = v; };
      X.prototype.send = function(body){
        const rec = { method: this._m, url: this._u, headers: Object.assign({}, this._h), body: JSON.parse(body || '{}') };
        window.__requests.push(rec);
        const self = this;
        setTimeout(function(){
          const reply = (${responderSource})(rec);
          self.status = reply.status || 200;
          self.responseText = JSON.stringify(reply.body);
          if (self.onload) self.onload();
        }, 0);
      };
      window.XMLHttpRequest = X;
    })();`;
}
const PRO = `window.calcgraphProFrontendConfig = { restUrl: 'https://s.test/wp-json/calcgraph/v1/', nonce: 'nonce-1', formResumeNonce: 'fn' };`;

function boot(formula, preScript) {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="btn">Go</button>
    <div id="sink1">START</div><div id="sink2">START</div><div id="sink3">START</div>
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e" data-post-id="42" data-output-configs="{}" style="display:none"></div>
  </body>`, { runScripts: 'dangerously', url: 'https://s.test/page', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(w.performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  if (preScript) w.eval(preScript);
  w.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; w.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, errs };
}
const sink = (w, n) => w.document.getElementById(`sink${n}`).textContent;
const dbRequests = (w) => (w.__requests || []).filter((r) => /\/db\/execute$/.test(r.url));
const noRuntimeError = (errs) => errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe|not allowed/i.test(e)).length === 0;

(async () => {
  await compile([mk('n', 'number', { value: 1 }), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' })], [cn('w', 'n', 'output0', 'o', 'input1')]);

  // ================= SELECT =================
  const selectEls = [
    mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'shop_db' }),
    mk('t', 'db-table', { dbTable: 'products' }),
    mk('q', 'constant-string', { value: 'lamp' }),
    mk('f', 'db-filter', { dbFilterColumn: 'products.name', dbFilterOperator: 'contains' }),
    mk('lit', 'db-filter', { dbFilterColumn: 'products.status', dbFilterOperator: 'eq', dbFilterValue: 'active' }),
    mk('sel', 'db-select', { dbLimit: 10, dbExecutePolicy: 'anyone', dbSignature: 'nls1:abc' }),
    mk('fld', 'api-field', { apiFieldPath: 'name', apiFieldType: 'string' }),
    mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    mk('o2', 'output', { outputTargetElementPin: true, selectedElement: 'sink2' }),
  ];
  const selectConns = [
    cn('c0', 'k', 'output0', 't', 'input0'),
    cn('c1', 't', 'output0', 'f', 'input0'),
    cn('c2', 'q', 'output0', 'f', 'input1'),
    cn('c3', 'f', 'output0', 'lit', 'input0'),
    cn('c4', 'lit', 'output0', 'sel', 'input0'),
    cn('c5', 'sel', 'output1', 'fld', 'input0'),
    cn('c6', 'fld', 'output0', 'o1', 'input1'),
    cn('c7', 'sel', 'output2', 'o2', 'input1'),
  ];
  const selectFormula = await compile(selectEls, selectConns);
  ok('SELECT graph compiles', !!selectFormula, selectFormula);
  ok('compiled formula calls __nodeDbSelect / __nodeDbChain', selectFormula.includes('__nodeDbSelect(') && selectFormula.includes('__nodeDbChain('), selectFormula);
  ok('compiled formula never contains the table or database name', !selectFormula.includes('products') && !selectFormula.includes('shop_db'), selectFormula);
  ok('compiled formula never contains operators or literal filter values', !/contains|"active"|dbFilter|dbTable/.test(selectFormula), selectFormula);
  ok('compiled formula never contains the admin signature', !selectFormula.includes('nls1:'), selectFormula);

  {
    const responder = `function(rec){ window.__calls = (window.__calls||0)+1; return { body: { ok: true, rows: [{ id: 1, name: 'Lamp' }, { id: 2, name: 'Lampshade' }], count: 2 } }; }`;
    const { w, errs } = boot(selectFormula, PRO + fakeXhr(responder));
    await wait(250);
    const reqs = dbRequests(w);
    ok('SELECT: no runtime error', noRuntimeError(errs), errs.join(' | '));
    ok('SELECT: exactly one request to /db/execute', reqs.length === 1, JSON.stringify(reqs));
    const body = reqs[0] ? reqs[0].body : {};
    ok('SELECT: request identifies the op node + page + block only', body.nodeId === 'sel' && body.postId === '42' && body.blockEditorId === 'e', JSON.stringify(body));
    ok('SELECT: request carries the WIRED filter value only', JSON.stringify(body.filters) === JSON.stringify({ f: 'lamp' }), JSON.stringify(body.filters));
    ok('SELECT: request carries no SQL / table / column text', !/products|shop_db|status|name|contains|SELECT/i.test(JSON.stringify(body)), JSON.stringify(body));
    ok('SELECT: REST nonce header is sent', reqs[0] && reqs[0].headers['X-WP-Nonce'] === 'nonce-1');
    ok('SELECT: First Row -> field shows the row value', sink(w, 1) === 'Lamp', sink(w, 1));
    ok('SELECT: Count shows the row count', sink(w, 2) === '2', sink(w, 2));
    w.dispatchEvent(new w.Event('resize'));
    await wait(150);
    ok('SELECT: unrelated recalculation reuses the cached result (no new request)', dbRequests(w).length === 1, String(dbRequests(w).length));
  }
  {
    const { w } = boot(selectFormula, fakeXhr(`function(){ return { body: { ok: true, rows: [] } }; }`));
    await wait(200);
    ok('without NodeLogic Pro the node is inert (no request at all)', dbRequests(w).length === 0);
  }
  {
    const { w } = boot(selectFormula, PRO + fakeXhr(`function(){ return { status: 403, body: { code: 'calcgraph_db_not_authorized', message: 'must be re-authorized' } }; }`));
    await wait(200);
    ok('a 403 from the server leaves the node empty (no crash, no retry loop)', dbRequests(w).length === 1 && sink(w, 2) === '0', `${dbRequests(w).length} / ${sink(w, 2)}`);
  }

  // ================= UPDATE (trigger-gated) + SELECT refresh =================
  const writeEls = [
    mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'shop_db' }),
    mk('t', 'db-table', { dbTable: 'products' }),
    mk('idv', 'number', { value: 5 }),
    mk('f', 'db-filter', { dbFilterColumn: 'products.id', dbFilterOperator: 'eq' }),
    mk('nm', 'constant-string', { value: 'New name' }),
    mk('ev', 'event-element', { eventUseManualId: true, eventId: 'btn' }),
    mk('u', 'db-update', { dbColumns: ['name'], dbMaxRows: 1, dbExecutePolicy: 'anyone' }),
    mk('st', 'api-field', { apiFieldPath: 'ok', apiFieldType: 'string' }),
    mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    mk('sel2', 'db-select', { dbLimit: 10 }),
    mk('o2', 'output', { outputTargetElementPin: true, selectedElement: 'sink2' }),
  ];
  const writeConns = [
    cn('c0', 'k', 'output0', 't', 'input0'),
    cn('c1', 't', 'output0', 'f', 'input0'),
    cn('c2', 'idv', 'output0', 'f', 'input1'),
    cn('c3', 'f', 'output0', 'u', 'input0'),
    cn('c4', 'nm', 'output0', 'u', 'input1'),
    cn('c5', 'ev', 'output0', 'u', 'input2'),
    cn('c6', 'u', 'output0', 'st', 'input0'),
    cn('c7', 'st', 'output0', 'o1', 'input1'),
    cn('c8', 't', 'output0', 'sel2', 'input0'),
    cn('c9', 'sel2', 'output2', 'o2', 'input1'),
  ];
  const writeFormula = await compile(writeEls, writeConns);
  ok('UPDATE graph compiles', !!writeFormula && writeFormula.includes('__nodeDbWrite('), writeFormula);
  {
    const responder = `function(rec){
      if (rec.body.nodeId === 'sel2') { window.__sel = (window.__sel||0)+1; return { body: { ok: true, rows: new Array(window.__sel).fill({ id: 1 }) } }; }
      return { body: { ok: true, affectedRows: 1, insertId: 0 } };
    }`;
    const { w, errs } = boot(writeFormula, PRO + fakeXhr(responder));
    await wait(250);
    const updates = () => dbRequests(w).filter((r) => r.body.nodeId === 'u');
    const selects = () => dbRequests(w).filter((r) => r.body.nodeId === 'sel2');
    ok('UPDATE: no runtime error', noRuntimeError(errs), errs.join(' | '));
    ok('UPDATE: nothing is written on page load (no trigger yet)', updates().length === 0, JSON.stringify(updates()));
    ok('SELECT on the same page loaded once', selects().length === 1 && sink(w, 2) === '1', `${selects().length} / ${sink(w, 2)}`);
    w.document.getElementById('btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(250);
    ok('UPDATE: one click -> exactly one write request', updates().length === 1, String(updates().length));
    const body = updates()[0] ? updates()[0].body : {};
    ok('UPDATE: request carries runtime values only (filter + column values)', JSON.stringify(body.filters) === JSON.stringify({ f: 5 }) && JSON.stringify(body.values) === JSON.stringify(['New name']), JSON.stringify(body));
    ok('UPDATE: Status.ok reaches the page after the response', sink(w, 1) === 'true', sink(w, 1));
    ok('a successful write refreshes SELECTs on the page', selects().length === 2 && sink(w, 2) === '2', `${selects().length} / ${sink(w, 2)}`);
    w.dispatchEvent(new w.Event('resize'));
    await wait(200);
    ok('UPDATE: later recalculations never re-send the write', updates().length === 1, String(updates().length));
    w.document.getElementById('btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(250);
    ok('UPDATE: a second click sends exactly one more write', updates().length === 2, String(updates().length));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
