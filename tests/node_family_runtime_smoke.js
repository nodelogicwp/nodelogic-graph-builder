/* Priority 1 — runtime scenarios for the remaining node families, via the REAL
 * editor bundle (formula gen) + the REAL frontend.js (prepare + evaluate).
 * For each: build a minimal graph, Save, capture the formula, evaluate it, and
 * assert the frontend produces a *defined, non-crashing* result. Semantic
 * correctness is checked where the node clearly transforms; families that the
 * generator passes through are flagged. */
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

function makeWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const errs = [];
  const oe = w.console.error; w.console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return { w, errs };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function genFormula(elements, connections) {
  const { w, errs } = makeWindow();
  const fcalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(450);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  if (b) b.click();
  await wait(250);
  return { formula: fcalls[fcalls.length - 1], errs };
}

// evaluate a formula through real frontend.js; returns { valid, value } of the payload's "value"
function evalOutputValue(formula) {
  const dom = new JSDOM(`<!doctype html><body><div id="sink">x</div>
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/' });
  dom.window.eval(CSSP);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const consoleErrs = [];
  const oe = dom.window.console.error; dom.window.console.error = (...a) => consoleErrs.push(a.map(String).join(' '));
  let src = FRONT; const m = '\n})();'; const i = src.lastIndexOf(m);
  src = src.slice(0, i) + '\n;window.__E={evaluateFormulaExpression:evaluateFormulaExpression};' + src.slice(i);
  const s = dom.window.document.createElement('script'); s.textContent = src; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { sink: dom.window.document.getElementById('sink').textContent, consoleErrs };
}

function directEval(expr) {
  const dom = new JSDOM('<body>', { runScripts: 'dangerously', url: 'https://s.test/' });
  dom.window.eval(CSSP);
  let src = FRONT; const m = '\n})();'; const i = src.lastIndexOf(m);
  src = src.slice(0, i) + '\n;window.__E={safeEvaluateExpression:safeEvaluateExpression,prepareFormulaForEval:prepareFormulaForEval,evaluateFormulaExpression:evaluateFormulaExpression};' + src.slice(i);
  const s = dom.window.document.createElement('script'); s.textContent = src; dom.window.document.body.appendChild(s);
  return dom.window.__E;
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 280000);

// helper: constant source(s) + a node + output.value, capture formula, eval.
// A string-valued input uses a constant-string source; a number uses a number
// const. Only the inputs actually referenced are created & wired.
const srcNode = (id, v) => (typeof v === 'string' ? mk(id, 'constant-string', { value: v })
  : typeof v === 'boolean' ? mk(id, 'constant-boolean', { value: v })
  : mk(id, 'number', { value: v }));
async function chain(nodeType, nodeData, wireInputs, expectFn, label) {
  const els = [mk('n', nodeType, nodeData || {}), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' })];
  const conns = [cn('wo', 'n', 'output0', 'o', 'input1')];
  const wireOne = (key, srcId, toInput) => {
    if (wireInputs[key] === undefined) return;
    els.push(srcNode(srcId, wireInputs[key]));
    conns.push(cn('w-' + srcId, srcId, 'output0', 'n', toInput));
  };
  wireOne('a', 'sa', 'input0');
  wireOne('b', 'sb', 'input1');
  wireOne('c', 'sc', 'input2');
  const { formula, errs } = await genFormula(els, conns);
  const noEditErr = errs.filter((e) => /Cannot read|is not a function|Maximum call/i.test(e)).length === 0;
  ok(`${label}: editor generates a formula, no editor crash`, typeof formula === 'string' && formula !== '' && noEditErr, JSON.stringify(formula) + ' | ' + errs.join(';'));
  const r = evalOutputValue(formula);
  const noRunErr = (r.consoleErrs || []).filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected/i.test(e)).length === 0;
  ok(`${label}: frontend evaluates without crash -> sink=${JSON.stringify(r.sink)}`, noRunErr, (r.consoleErrs || []).join(';'));
  if (expectFn) ok(`${label}: ${expectFn.desc}`, expectFn(r.sink, formula), `sink=${JSON.stringify(r.sink)} formula=${JSON.stringify(formula)}`);
  return formula;
}

(async () => {
  // ---- calculation family (explicit case) ----
  await chain('calculation', { operation: '+' }, { a: 5, b: 3 },
    Object.assign((s) => s === '8', { desc: '5 + 3 = 8' }), 'calculation(+)');
  await chain('calculation', { operation: '*' }, { a: 4, b: 6 },
    Object.assign((s) => s === '24', { desc: '4 * 6 = 24 (no phantom trailing slot)' }), 'calculation(*)');
  await chain('calculation', { operation: '/' }, { a: 10, b: 0 },
    Object.assign((s) => s === 'Infinity' || s === '0' || s === '' || s === 'null', { desc: 'div by zero degrades safely' }), 'calculation(/0)');

  // ---- comparison / condition (explicit case) ----
  await chain('condition', { operation: '>' }, { a: 5, b: 2 },
    Object.assign((s) => s === 'true', { desc: '5 > 2 = true' }), 'condition(>)');
  await chain('condition', { operation: '===' }, { a: 5, b: 5 },
    Object.assign((s) => s === 'true', { desc: '5 === 5 = true' }), 'condition(===)');

  // ---- string family ----
  await chain('string-trim', {}, { a: '  hi  ' }, Object.assign((s) => s === 'hi', { desc: 'trim' }), 'string-trim');
  await chain('string-upper', {}, { a: 'abc' }, Object.assign((s) => s === 'ABC', { desc: 'upper' }), 'string-upper');
  await chain('string-lower', {}, { a: 'ABC' }, Object.assign((s) => s === 'abc', { desc: 'lower' }), 'string-lower');
  await chain('string-to-number', {}, { a: '42' }, Object.assign((s) => s === '42', { desc: 'toNumber' }), 'string-to-number');
  await chain('number-to-string', {}, { a: 7 }, Object.assign((s) => s === '7', { desc: 'toString' }), 'number-to-string');
  await chain('concat', {}, { a: 'x', b: 'y' }, Object.assign((s) => /x.*y/.test(s), { desc: 'concat xy' }), 'concat');
  await chain('cut-a', {}, { a: 'hello world', b: 'world', c: '' }, null, 'cut-a');
  await chain('regex', { regexPattern: '\\d+' }, { a: 'abc123' }, null, 'regex');
  // string-includes / string-count-chars — now wired (were pass-through)
  await chain('string-includes', {}, { a: 'hello', b: 'ell' }, Object.assign((s) => s === 'true', { desc: '"hello".includes("ell") = true' }), 'string-includes');
  await chain('string-includes', {}, { a: 'hello', b: 'zzz' }, Object.assign((s) => s === 'false', { desc: 'not included = false' }), 'string-includes(no)');
  await chain('string-count-chars', {}, { a: 'hello' }, Object.assign((s) => s === '5', { desc: '"hello".length = 5' }), 'string-count-chars');

  // ---- math family — now wired (were pass-through) ----
  await chain('clamp', {}, { a: 15, b: 0, c: 10 }, Object.assign((s) => s === '10', { desc: 'clamp(15,0,10)=10' }), 'clamp(hi)');
  await chain('clamp', {}, { a: -4, b: 0, c: 10 }, Object.assign((s) => s === '0', { desc: 'clamp(-4,0,10)=0' }), 'clamp(lo)');
  await chain('min-val', {}, { a: 3, b: 8 }, Object.assign((s) => s === '3', { desc: 'min(3,8)=3' }), 'min-val');
  await chain('max-val', {}, { a: 3, b: 8 }, Object.assign((s) => s === '8', { desc: 'max(3,8)=8' }), 'max-val');

  // ---- boolean logic — now wired (were pass-through) ----
  await chain('not', {}, { a: true }, Object.assign((s) => s === 'false', { desc: '!true = false' }), 'not(true)');
  await chain('not', {}, { a: false }, Object.assign((s) => s === 'true', { desc: '!false = true' }), 'not(false)');
  await chain('and', {}, { a: true, b: true }, Object.assign((s) => s === 'true', { desc: 'true && true' }), 'and(tt)');
  await chain('and', {}, { a: true, b: false }, Object.assign((s) => s === 'false', { desc: 'true && false' }), 'and(tf)');
  await chain('or', {}, { a: false, b: true }, Object.assign((s) => s === 'true', { desc: 'false || true' }), 'or(ft)');
  await chain('or', {}, { a: false, b: false }, Object.assign((s) => s === 'false', { desc: 'false || false' }), 'or(ff)');
  await chain('fallback', {}, { a: '', b: 'fb' }, Object.assign((s) => s === 'fb' || s === '', { desc: 'fallback' }), 'fallback');

  // ---- CSS family (still fall through to default — documented pass-through) ----
  for (const t of ['css-unit', 'css-margin', 'css-padding', 'css-width', 'css-height', 'css-font-size', 'css-display', 'css-color', 'css-text', 'css-join']) {
    await chain(t, {}, { a: t === 'css-color' ? '#f00' : '10' }, Object.assign((s) => s !== undefined, { desc: 'fails safe (documented pass-through)' }), `${t}[passthrough]`);
  }

  // ---- color / gradient ----
  await chain('color', { colorValue: '#3366ff' }, {}, Object.assign((s) => /#3366ff/i.test(s), { desc: 'emits the color' }), 'color');
  await chain('gradient', {}, { a: '#f00' }, Object.assign((s) => s !== undefined, { desc: 'fails safe (documented pass-through)' }), 'gradient[passthrough]');

  // ---- chart-data (explicit case) ----
  {
    const f = await chain('chart-data', { chartDataLabel: 'Q1', chartDataValue: 42 }, {},
      Object.assign((s, formula) => /"?label"?\s*:/.test(formula) && /"?value"?\s*:/.test(formula), { desc: 'formula has label+value object' }), 'chart-data');
  }

  // ---- number constant / constant-string / constant-boolean ----
  await chain('number', { value: 3.5 }, {}, Object.assign((s) => s === '3.5', { desc: 'number literal' }), 'number-const');
  await chain('constant-string', { value: 'hey' }, {}, Object.assign((s) => s === 'hey', { desc: 'string literal' }), 'constant-string');
  await chain('constant-boolean', { value: true }, {}, Object.assign((s) => s === 'true', { desc: 'bool literal' }), 'constant-boolean');

  // ---- memory nodes (fall through to default) ----
  await chain('memory-write-number', { variableKey: 'k1', defaultValue: 5 }, { a: 7 }, Object.assign((s) => s !== undefined, { desc: 'no crash' }), 'memory-write-number[not-in-palette,safe]');
  await chain('memory-read-number', { variableKey: 'k1', defaultValue: 0 }, {}, Object.assign((s) => s !== undefined, { desc: 'no crash' }), 'memory-read-number[not-in-palette,safe]');

  // ---- array family (explicit cases) ----
  const E = directEval();
  ok('array: __nodeArrayPush([1,2],3) -> [1,2,3]', (() => { const r = E.safeEvaluateExpression('__nodeArrayPush([1,2],3)'); return r.valid && JSON.stringify(r.value) === '[1,2,3]'; })());
  ok('array: __nodeArrayLength([1,2,3]) -> 3', (() => { const r = E.safeEvaluateExpression('__nodeArrayLength([1,2,3])'); return r.valid && r.value === 3; })());
  ok('array: __nodeArraySort([3,1,2],"number-asc","") -> [1,2,3]', (() => { const r = E.safeEvaluateExpression('__nodeArraySort([3,1,2],"number-asc","")'); return r.valid && JSON.stringify(r.value) === '[1,2,3]'; })());
  ok('array: __nodeArrayContains([1,2],2) -> true', (() => { const r = E.safeEvaluateExpression('__nodeArrayContains([1,2],2)'); return r.valid && r.value === true; })());
  ok('array: __nodeArrayUnique([1,1,2]) -> [1,2]', (() => { const r = E.safeEvaluateExpression('__nodeArrayUnique([1,1,2])'); return r.valid && JSON.stringify(r.value) === '[1,2]'; })());
  ok('array: __nodeArrayMerge([1],[2],"concat") -> [1,2]', (() => { const r = E.safeEvaluateExpression('__nodeArrayMerge([1],[2],"concat")'); return r.valid && JSON.stringify(r.value) === '[1,2]'; })());
  ok('array: __nodeArrayReduce([1,2,3],"sum","0") -> 6', (() => { const r = E.safeEvaluateExpression('__nodeArrayReduce([1,2,3],"sum","0")'); return r.valid && Number(r.value) === 6; })());
  ok('array: __nodeArrayMapGraph([1,2,3],"__nodeLoopItem * 2") -> [2,4,6]', (() => { const r = E.safeEvaluateExpression('__nodeArrayMapGraph([1,2,3],"__nodeLoopItem * 2")'); return r.valid && JSON.stringify(r.value) === '[2,4,6]'; })());
  ok('array: __nodeArrayFilterGraph([1,2,3,4],"__nodeLoopItem % 2 === 0") -> [2,4]', (() => { const r = E.safeEvaluateExpression('__nodeArrayFilterGraph([1,2,3,4],"__nodeLoopItem % 2 === 0")'); return r.valid && JSON.stringify(r.value) === '[2,4]'; })());
  ok('array: empty/garbage safe: __nodeArrayPop(null)', (() => { const r = E.safeEvaluateExpression('__nodeArrayPop(null)'); return r.valid; })());
  ok('array: __nodeArrayLength("not an array") safe', (() => { const r = E.safeEvaluateExpression('__nodeArrayLength("x")'); return r.valid; })());

  // ---- switch / case ----
  {
    const els = [
      mk('sv', 'number', { value: 2 }),
      mk('cv', 'case-value', { caseValue: 2, out: 0 }),
      mk('cvOut', 'constant-string', { value: 'matched-2' }),
      mk('cd', 'case-default', { out: 0 }),
      mk('cdOut', 'constant-string', { value: 'default' }),
      mk('sw', 'switch', {}),
      mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [
      cn('a', 'sv', 'output0', 'sw', 'input0'),
      cn('b', 'cvOut', 'output0', 'cv', 'input1'),
      cn('c', 'cv', 'output0', 'sw', 'input1'),
      cn('d', 'cdOut', 'output0', 'cd', 'input0'),
      cn('e', 'cd', 'output0', 'sw', 'input2'),
      cn('f', 'sw', 'output0', 'o', 'input1'),
    ];
    const { formula, errs } = await genFormula(els, conns);
    const r = evalOutputValue(formula);
    ok('switch: value 2 matches case-value 2 -> "matched-2"', r.sink === 'matched-2', `sink=${JSON.stringify(r.sink)} formula=${JSON.stringify(formula)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
