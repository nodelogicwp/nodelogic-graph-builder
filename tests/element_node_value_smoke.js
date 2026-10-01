/* Regression for the reported "Element Node zwraca Obiekt zamiast Wartość"
 * bug (legacy 'element' node returns an Object instead of a Value).
 *
 * TWO bugs were found and fixed together, since the second only became
 * visible once the first was gone:
 *
 *  1) Whenever the node still carried a legacy `eventType` (Click/Change/...
 *     -- a control since removed from the config panel, but a previously-
 *     saved graph could still have the data field set), the compiler emitted
 *     `__nodeEvent(id, eventType)`, which returns `{eventKey, triggeredCount}`
 *     -- an object, not the element's value. Fixed by always taking the
 *     value-returning branch, regardless of any stale eventType data.
 *
 *  2) That "value" branch itself, `[${selectedElement}]`, was never a real
 *     element/value reference -- it emitted a bare AST Identifier named
 *     after the raw element id. At runtime, resolveFormulaIdentifier only
 *     recognizes a fixed set of context names (plus the "oN" custom-node
 *     convention); any real id threw "Identifier ... is not allowed", which
 *     was silently swallowed into a default (observed as the value being
 *     replaced by 0), in BOTH manual-ID and dropdown modes. Fixed by
 *     resolving the id the same safe way element-ref does
 *     (`__nodeGetElement`) and reading its live `"value"` via the existing
 *     `__nodeGetElementProp` property reader.
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
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 90000);

function makeEditorWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
// See api_async_smoke.js: a retry with a longer wait guards against
// environment cold-start flakiness in a fresh process.
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
function bootRuntime(bodyHtml, formula) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(w.performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  w.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; w.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, errs };
}
const noRuntimeError = (errs) => errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;

(async () => {
  await compile([mk('n', 'number', { value: 1 }), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' })], [cn('w', 'n', 'output0', 'o', 'input1')]);

  // ---- Manual-ID mode: real element value flows through, not 0 / an object ----
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'sink1' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setVal', 'action-set-value', {}),
      mk('el', 'element', { elementUseManualId: true, customElementId: 'source1' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setVal', 'input0'),
      cn('s2', 'el', 'output0', 'setVal', 'input1'),
    ];
    const f = await compile(elements, connections);
    ok('Element node compiles', !!f, f);
    ok('Element node: no __nodeEvent object-wrapping in the compiled formula', !f.includes('__nodeEvent('), f);
    ok('Element node: resolves via __nodeGetElement (same safe pattern as element-ref)', f.includes('__nodeGetElement("source1")'), f);
    const { w, errs } = bootRuntime('<input id="source1" value="Hello" /><div id="sink1"></div>', f);
    await wait(120);
    ok('Element node: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Element node: the REAL live value is read (not 0, not an object)', w.document.getElementById('sink1').textContent === 'Hello', w.document.getElementById('sink1').textContent);
  }

  // ---- A stale legacy eventType on the saved node data must not resurrect the old object-returning behavior ----
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'sink2' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setVal', 'action-set-value', {}),
      mk('el', 'element', { elementUseManualId: true, customElementId: 'source2', eventType: 'click' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setVal', 'input0'),
      cn('s2', 'el', 'output0', 'setVal', 'input1'),
    ];
    const f = await compile(elements, connections);
    ok('Element node (stale eventType data): still compiles to a value, not __nodeEvent', !!f && !f.includes('__nodeEvent('), f);
    const { w, errs } = bootRuntime('<input id="source2" value="World" /><div id="sink2"></div>', f);
    await wait(120);
    ok('Element node (stale eventType data): no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Element node (stale eventType data): real value still read, not "[object Object]"', w.document.getElementById('sink2').textContent === 'World', w.document.getElementById('sink2').textContent);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
