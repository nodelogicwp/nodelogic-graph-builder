/* For Each execution — full coverage. Real editor bundle -> Save -> real
 * frontend.js. Covers: DOM-element arrays, primitive arrays via Collect Results
 * (existing pattern must still work), empty / single / multi, per-item item
 * correctness, no cross-iteration context leak, Element Property on the current
 * item, nested loops don't crash. */
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
function run(formula, bodyHtml) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/' });
  dom.window.eval(CSSP);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { doc: dom.window.document, errs };
}
const texts = (doc, sel) => Array.from(doc.querySelectorAll(sel)).map((e) => e.textContent);
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 260000);

// Build: element-ref(id) -> get-children(children/array) -> for-each -> output.Element,
// Set Text action whose value comes from `setValueSource`.
function forEachSetTextGraph(elId, setValueSource) {
  const els = [
    mk('elref', 'element-ref', { elementUseManualId: true, customElementId: elId }),
    mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
    mk('fe', 'array-for-each', {}),
    mk('out', 'output', { outputTargetElementPin: true }),
    mk('st', 'action-set-text', { valueText: 'X' }),   // constant Set Text value
  ];
  const conns = [
    cn('c1', 'elref', 'output0', 'gc', 'input0'),
    cn('c2', 'gc', 'output0', 'fe', 'input0'),
    cn('c3', 'fe', 'output0', 'out', 'input0'),
    cn('c5', 'out', 'output0', 'st', 'input0'),
  ];
  if (setValueSource === 'prop') {
    // Set Text value = the current item's own textContent, upper-cased.
    els.push(mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }));
    els.push(mk('up', 'string-upper', {}));
    conns.push(cn('p1', 'fe', 'output0', 'prop', 'input0'));   // property of the current item
    conns.push(cn('p2', 'prop', 'output0', 'up', 'input0'));
    conns.push(cn('p3', 'up', 'output0', 'st', 'input1'));     // Set Text value input
  }
  return { els, conns };
}

(async () => {
  // 1. multi-element DOM array, constant value
  {
    const { els, conns } = forEachSetTextGraph('list-1', 'const');
    const f = await gen(els, conns);
    const { doc, errs } = run(f, `<ul data-nodelogic-id="list-1"><li>a</li><li>b</li><li>c</li></ul>`);
    ok('1 multi: every <li> -> "X"', JSON.stringify(texts(doc, '[data-nodelogic-id="list-1"] li')) === JSON.stringify(['X', 'X', 'X']), JSON.stringify(texts(doc, 'li')) + ' | ' + JSON.stringify(f));
    ok('1 multi: no runtime error', errs.filter((e) => /Cannot read|is not a function|SyntaxError/i.test(e)).length === 0, errs.join(';'));
  }
  // 2. single-element array
  {
    const { els, conns } = forEachSetTextGraph('list-1', 'const');
    const f = await gen(els, conns);
    const { doc } = run(f, `<ul data-nodelogic-id="list-1"><li>only</li></ul>`);
    ok('2 single: the one <li> -> "X"', JSON.stringify(texts(doc, 'li')) === JSON.stringify(['X']), JSON.stringify(texts(doc, 'li')));
  }
  // 3. empty array -> nothing happens, no crash
  {
    const { els, conns } = forEachSetTextGraph('list-1', 'const');
    const f = await gen(els, conns);
    const { doc, errs } = run(f, `<ul data-nodelogic-id="list-1"></ul>`);
    ok('3 empty: no rows, no crash', texts(doc, 'li').length === 0 && errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
  }
  // 4. per-item correctness + no cross-iteration leak: value = each item's OWN uppercased text
  {
    const { els, conns } = forEachSetTextGraph('list-1', 'prop');
    const f = await gen(els, conns);
    const { doc, errs } = run(f, `<ul data-nodelogic-id="list-1"><li>alpha</li><li>beta</li><li>gamma</li></ul>`);
    ok('4 per-item: each <li> gets ITS OWN uppercased text (no leak)',
      JSON.stringify(texts(doc, 'li')) === JSON.stringify(['ALPHA', 'BETA', 'GAMMA']),
      JSON.stringify(texts(doc, 'li')) + ' | ' + JSON.stringify(f));
    ok('4 per-item: no runtime error', errs.filter((e) => /Cannot read|is not a function|SyntaxError/i.test(e)).length === 0, errs.join(';'));
  }
  // 5. EXISTING pattern must still work: real array (Get Children) -> For Each
  //    -> Element Property(textContent) -> Collect Results -> Output.value
  {
    const els = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'src' }),
      mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
      mk('fe', 'array-for-each', {}),
      mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
      mk('col', 'array-collect', {}),
      mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [
      cn('a0', 'elref', 'output0', 'gc', 'input0'),
      cn('a4', 'gc', 'output0', 'fe', 'input0'),
      cn('a5', 'fe', 'output0', 'prop', 'input0'),
      cn('a7', 'prop', 'output0', 'col', 'input0'),
      cn('a8', 'col', 'output0', 'out', 'input1'),
    ];
    const f = await gen(els, conns);
    const { doc, errs } = run(f, `<div data-nodelogic-id="src"><b>one</b><b>two</b><b>three</b></div><div data-nodelogic-id="sink">x</div>`);
    const sink = doc.querySelector('[data-nodelogic-id="sink"]').textContent;
    ok('5 collect (existing): Get Children -> For Each -> textContent -> Collect -> ["one","two","three"]',
      /one/.test(sink) && /two/.test(sink) && /three/.test(sink),
      `sink=${JSON.stringify(sink)} formula=${JSON.stringify(f)}`);
    ok('5 collect: no runtime error', errs.filter((e) => /Cannot read|is not a function|SyntaxError/i.test(e)).length === 0, errs.join(';'));
  }
  // 6. nested For Each must not crash / corrupt (architecture uses a single loop var)
  {
    const els = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'outer' }),
      mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
      mk('fe', 'array-for-each', {}),
      mk('gc2', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
      mk('fe2', 'array-for-each', {}),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('st', 'action-set-text', { valueText: 'N' }),
      mk('sc', 'constant-string', { value: 'N' }),
    ];
    const conns = [
      cn('c1', 'elref', 'output0', 'gc', 'input0'),
      cn('c2', 'gc', 'output0', 'fe', 'input0'),
      cn('c3', 'fe', 'output0', 'gc2', 'input0'),
      cn('c4', 'gc2', 'output0', 'fe2', 'input0'),
      cn('c5', 'fe2', 'output0', 'out', 'input0'),
      cn('c6', 'sc', 'output0', 'out', 'input1'),
      cn('c7', 'out', 'output0', 'st', 'input0'),
    ];
    const f = await gen(els, conns);
    const { errs } = run(f, `<div data-nodelogic-id="outer"><div><span>x</span></div></div>`);
    ok('6 nested: generates a formula and does not crash the runtime',
      typeof f === 'string' && errs.filter((e) => /Cannot read|is not a function|SyntaxError|Maximum call/i.test(e)).length === 0,
      JSON.stringify(f) + ' | ' + errs.join(';'));
  }
  // 7. For Each fed a non-array (element, not array) -> no iteration, no crash
  {
    const els = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 't' }),
      mk('gc', 'get-children', { getChildrenMode: 'single', getChildrenSingleIndex: 0 }), // single -> element, not array
      mk('fe', 'array-for-each', {}),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('st', 'action-set-text', { valueText: 'Z' }),
      mk('sc', 'constant-string', { value: 'Z' }),
    ];
    const conns = [
      cn('c1', 'elref', 'output0', 'gc', 'input0'),
      cn('c2', 'gc', 'output0', 'fe', 'input0'),
      cn('c3', 'fe', 'output0', 'out', 'input0'),
      cn('c4', 'sc', 'output0', 'out', 'input1'),
      cn('c5', 'out', 'output0', 'st', 'input0'),
    ];
    const f = await gen(els, conns);
    const { errs } = run(f, `<div data-nodelogic-id="t"><h2>hi</h2></div>`);
    ok('7 non-array into For Each: no crash', errs.filter((e) => /Cannot read|is not a function|SyntaxError/i.test(e)).length === 0, errs.join(';'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
