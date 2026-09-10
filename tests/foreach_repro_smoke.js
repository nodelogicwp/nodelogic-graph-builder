/* RELEASE BLOCKER repro: Get Element -> Get Children (array) -> For Each ->
 * subgraph (current item) -> Set Text.  The For Each subgraph must execute once
 * per array item. Real editor bundle -> Save -> real frontend.js. */
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

function makeWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function gen(elements, connections) {
  const w = makeWindow();
  const fcalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(500);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  if (b) b.click();
  await wait(300);
  return fcalls[fcalls.length - 1];
}
function runFrontend(formula, bodyHtml) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/' });
  dom.window.eval(CSSP);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { doc: dom.window.document, errs };
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  // ---- The exact failing graph ----------------------------------------
  const els = [
    mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'list-1' }),
    mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
    mk('fe', 'array-for-each', {}),
    mk('sc', 'constant-string', { value: 'Changed' }),
    mk('st', 'action-set-text', { valueText: 'Changed' }),
    mk('out', 'output', { outputTargetElementPin: true }),
  ];
  const conns = [
    cn('c1', 'elref', 'output0', 'gc', 'input0'),
    cn('c2', 'gc', 'output0', 'fe', 'input0'),
    cn('c3', 'fe', 'output0', 'out', 'input0'),   // loop item element -> Output.Element
    cn('c4', 'sc', 'output0', 'out', 'input1'),    // Value pin
    cn('c5', 'out', 'output0', 'st', 'input0'),    // Set Text action chained
  ];
  const formula = await gen(els, conns);
  console.log('CAPTURED FORMULA:', JSON.stringify(formula));

  const DOM_HTML = `<div data-nodelogic-id="list-1">
      <p class="row">one</p><p class="row">two</p><p class="row">three</p>
    </div>`;
  const { doc, errs } = runFrontend(formula, DOM_HTML);
  const rows = Array.from(doc.querySelectorAll('[data-nodelogic-id="list-1"] .row')).map((e) => e.textContent);
  console.log('ROW TEXTS AFTER:', JSON.stringify(rows));

  ok('repro: no runtime error', errs.filter((e) => /Cannot read|is not a function|SyntaxError/i.test(e)).length === 0, errs.join(';'));
  ok('repro: For Each executed the subgraph for EVERY child (all rows -> "Changed")',
    rows.length === 3 && rows.every((t) => t === 'Changed'),
    `got ${JSON.stringify(rows)}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
