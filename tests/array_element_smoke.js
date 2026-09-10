/* Array<Element> support — full matrix.
 * Editor: real dist/build/elementor.js (formula gen + connection/type compat).
 * Runtime: real frontend.js (DOM elements flowing through array operations).
 * Persistence: saved graph must never contain a live DOM node. */
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
async function editor(graph) {
  const w = makeWindow();
  const fcalls = [], scalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: graph, onStateChange: (st) => scalls.push(st), onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(500);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  if (b) b.click();
  await wait(300);
  return { formula: fcalls[fcalls.length - 1], state: scalls[scalls.length - 1], win: w };
}
// evaluate a full logic-block formula, return sink/target text + errors
function frontend(formula, bodyHtml) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/' });
  dom.window.eval(CSSP);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { doc: dom.window.document, errs };
}
// direct access to the runtime array helpers
function helpers() {
  const dom = new JSDOM(`<body><div id="p"><a id="a">a</a><b id="b">b</b><i id="i">i</i></div><div id="q"><span id="s1">1</span><span id="s2">2</span></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/' });
  dom.window.eval(CSSP);
  let src = FRONT; const m = '\n})();'; const k = src.lastIndexOf(m);
  src = src.slice(0, k) + '\n;window.__H={ __nodeGetChildren, __nodeGetElement, __nodeArrayPush, __nodeArrayPop, __nodeArrayRemove, __nodeArrayReplace, __nodeArrayLength, __nodeArrayContains, __nodeArrayUnique, __nodeArrayMerge, __nodeArraySort, __nodeArrayReduce, __nodeArrayFind, __nodeArrayForEach, __nodeArrayCollect, __nodeArrayMapGraph, __nodeArrayFilterGraph, safeEvaluateExpression };' + src.slice(k);
  const s = dom.window.document.createElement('script'); s.textContent = src; dom.window.document.body.appendChild(s);
  return { H: dom.window.__H, doc: dom.window.document };
}
const idsOf = (a) => (Array.isArray(a) ? a.map((e) => (e && e.nodeType === 1 ? e.id : String(e))) : String(a));
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 240000);

(async () => {
  const H = helpers().H;
  const P = H.__nodeGetElement('p');   // <a id=a><b id=b><i id=i>
  const Q = H.__nodeGetElement('q');   // <span s1><span s2>
  const kids = H.__nodeGetChildren('p');
  const kidsQ = H.__nodeGetChildren('q');

  /* ---- runtime: an Element survives every array op as a live reference ---- */
  ok('B push: element pushed, list grows, item is the SAME live node',
    (() => { const r = H.__nodeArrayPush([kids[0]], kids[1]); return r.length === 2 && r[1] === kids[1] && r[1].nodeType === 1; })());
  ok('C get (replace/remove by index) keeps live nodes',
    (() => { const r = H.__nodeArrayReplace(kids.slice(), 1, Q); return r[1] === Q && r[0] === kids[0] && r[2] === kids[2]; })());
  ok('C remove-by-index on element array',
    (() => { const r = H.__nodeArrayRemove(kids.slice(), 0); return r.length === 2 && r[0] === kids[1]; })());
  ok('array-length of element array', H.__nodeArrayLength(kids) === 3);
  ok('array-contains finds an element by identity', H.__nodeArrayContains(kids, kids[1]) === true && H.__nodeArrayContains(kids, Q) === false);
  ok('array-pop returns the shortened live-node list', (() => { const r = H.__nodeArrayPop(kids.slice()); return r.length === 2 && r[0] === kids[0]; })());
  ok('array-forEach passes the live-node array through', (() => { const r = H.__nodeArrayForEach(kids); return r.length === 3 && r[0] === kids[0]; })());
  ok('array-collect wraps one live node', (() => { const r = H.__nodeArrayCollect(kids[2]); return r.length === 1 && r[0] === kids[2]; })());

  /* ---- I merge two Element arrays (distinct live nodes preserved) ---- */
  ok('I merge (concat): [a,b,i] + [s1,s2] -> 5 live nodes',
    (() => { const r = H.__nodeArrayMerge(kids, kidsQ, 'concat'); return r.length === 5 && r[3] === kidsQ[0] && r[4] === kidsQ[1]; })());
  ok('I merge (union): distinct elements are NOT collapsed (the JSON.stringify bug)',
    (() => { const r = H.__nodeArrayMerge(kids, kidsQ, 'union'); return r.length === 5; })(), 'union collapsed distinct elements');
  ok('unique on element array with a real duplicate -> dedups by identity',
    (() => { const dup = [kids[0], kids[1], kids[0], kids[2], kids[1]]; const r = H.__nodeArrayUnique(dup); return idsOf(r).join(',') === 'a,b,i'; })());
  ok('unique still dedups primitive arrays exactly as before',
    (() => JSON.stringify(H.__nodeArrayUnique([1, 1, 2, '2', '2', true, true])) === JSON.stringify([1, 2, '2', true]))());
  ok('unique still dedups plain-object (zip) arrays by value as before',
    (() => { const r = H.__nodeArrayUnique([{ x: 1 }, { x: 1 }, { x: 2 }]); return r.length === 2 && r[0].x === 1 && r[1].x === 2; })());

  /* ---- F/G map & filter over an element array via graph-body eval ---- */
  ok('F map: Array<element> -> each item to a child element',
    (() => {
      const inner = '__nodeGetChildAt(__nodeLoopItem, 0)';
      const r = H.__nodeArrayMapGraph([P, Q], inner); // first child of each
      return r.length === 2 && r[0] === kids[0] && r[1] === kidsQ[0];
    })());
  ok('G filter: keep elements whose id is "b"',
    (() => {
      const r = H.__nodeArrayFilterGraph(kids, '__nodeGetElementProp(__nodeLoopItem, "id") === "b"');
      return r.length === 1 && r[0] === kids[1];
    })());
  ok('M no cross-iteration leak: map body reads each item independently',
    (() => {
      const r = H.__nodeArrayMapGraph(kids, '__nodeGetElementProp(__nodeLoopItem, "id")');
      return JSON.stringify(r) === JSON.stringify(['a', 'b', 'i']);
    })());

  /* ---- N malformed / non-element values do not crash ---- */
  ok('N: array ops on garbage (null / string / mixed) do not throw', (() => {
    try {
      H.__nodeArrayUnique(null); H.__nodeArrayUnique('nope'); H.__nodeArrayUnique([null, undefined, 1, {}, P, 'x']);
      H.__nodeArrayMerge(null, undefined, 'union'); H.__nodeArrayPush('x', P); H.__nodeArrayPop(42);
      H.__nodeArraySort([P, Q, 1, 'a'], 'number-asc', ''); H.__nodeArrayReduce([P, 1, 'x'], 'sum', 0);
      H.__nodeArrayContains('x', P); H.__nodeArrayForEach({});
      return true;
    } catch (e) { return e.message; }
  })() === true);
  ok('J empty array: length 0, unique [], forEach [], merge []',
    H.__nodeArrayLength([]) === 0 &&
    H.__nodeArrayUnique([]).length === 0 &&
    H.__nodeArrayForEach([]).length === 0 &&
    H.__nodeArrayMerge([], [], 'concat').length === 0);
  ok('K single-element array', (() => { const r = H.__nodeArrayPush([], P); return r.length === 1 && r[0] === P; })());
  ok('L multi-element array preserved in order', (() => { const r = H.__nodeArrayMerge([kids[0]], [kids[1], kids[2]], 'concat'); return idsOf(r).join(',') === 'a,b,i'; })());

  /* ---- O editor connection / type compatibility ---- */
  {
    // Get Children (array<element>) -> For Each -> item -> Array Push(item into a seed) ... then Length -> Output.value
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'list' }),
        mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
        mk('seed', 'array', { arrayItemType: 'element' }),
        mk('push', 'array-push', {}),
        mk('fe', 'array-for-each', {}),
        mk('len', 'array-length', {}),
        mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
      ],
      connections: [
        cn('a0', 'elref', 'output0', 'gc', 'input0'),
        cn('a1', 'gc', 'output0', 'fe', 'input0'),
        cn('a2', 'seed', 'output0', 'push', 'input0'),      // array pin
        cn('a3', 'fe', 'output0', 'push', 'input1'),         // element item pin  <-- previously rejected
        cn('a4', 'push', 'output0', 'len', 'input0'),
        cn('a5', 'len', 'output0', 'out', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const { formula, state } = await editor(g);
    // If the element->push connection had been rejected, `push` would have no input1
    // and the formula would not chain fe -> push.
    ok('O connection: For Each item (element) -> Array Push item pin ACCEPTED',
      typeof formula === 'string' && /__nodeArrayPush\(/.test(formula), JSON.stringify(formula));
    ok('O type: seed Array node persists arrayItemType "element"',
      !!state && Array.isArray(state.elements) &&
      state.elements.find((e) => e.id === 'seed')?.data?.arrayItemType === 'element',
      JSON.stringify(state && state.elements && state.elements.find((e) => e.id === 'seed')?.data));

    /* ---- P persistence: NO serialized DOM node anywhere in the saved graph ---- */
    const json = JSON.stringify(state);
    ok('P persistence: saved graph is valid JSON and holds no DOM node markers',
      json.length > 0 &&
      !/"nodeType"\s*:\s*1/.test(json) &&
      !/"tagName"/.test(json) &&
      !/\[object HTML/.test(json) &&
      !/"ownerDocument"/.test(json),
      'suspected serialized DOM node in saved graph');
    ok('P persistence: element item type is a plain "element" string tag',
      /"arrayItemType":"element"/.test(json.replace(/\s/g, '')), 'arrayItemType not persisted as "element"');
  }

  /* ---- A/D/E end-to-end: Get Children -> For Each -> Output.Element -> Set Text ---- */
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'list' }),
        mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
        mk('fe', 'array-for-each', {}),
        mk('out', 'output', { outputTargetElementPin: true }),
        mk('st', 'action-set-text', { valueText: 'DONE' }),
      ],
      connections: [
        cn('a0', 'elref', 'output0', 'gc', 'input0'),
        cn('a1', 'gc', 'output0', 'fe', 'input0'),
        cn('a2', 'fe', 'output0', 'out', 'input0'),
        cn('a3', 'out', 'output0', 'st', 'input0'),
      ],
      formula: '', updatedAt: 0,
    };
    const { formula } = await editor(g);
    const { doc, errs } = frontend(formula, `<ul data-nodelogic-id="list"><li>a</li><li>b</li><li>c</li></ul>`);
    ok('E e2e: Get Children -> For Each -> Output.Element -> Set Text on every element',
      JSON.stringify(Array.from(doc.querySelectorAll('[data-nodelogic-id="list"] li')).map((e) => e.textContent)) === JSON.stringify(['DONE', 'DONE', 'DONE']),
      JSON.stringify(Array.from(doc.querySelectorAll('li')).map((e) => e.textContent)) + ' | ' + JSON.stringify(formula));
    ok('E e2e: no runtime error', errs.filter((e) => /Cannot read|is not a function|SyntaxError/i.test(e)).length === 0, errs.join(';'));
  }

  /* ---- H Collect Results over element -> array ---- */
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'list' }),
        mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
        mk('fe', 'array-for-each', {}),
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'id' }),
        mk('col', 'array-collect', {}),
        mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
      ],
      connections: [
        cn('a0', 'elref', 'output0', 'gc', 'input0'),
        cn('a1', 'gc', 'output0', 'fe', 'input0'),
        cn('a2', 'fe', 'output0', 'prop', 'input0'),
        cn('a3', 'prop', 'output0', 'col', 'input0'),
        cn('a4', 'col', 'output0', 'out', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const { formula } = await editor(g);
    const { doc } = frontend(formula, `<div data-nodelogic-id="list"><b id="x1">1</b><b id="x2">2</b></div><div data-nodelogic-id="sink">s</div>`);
    const sink = doc.querySelector('[data-nodelogic-id="sink"]').textContent;
    ok('H collect: For Each -> id -> Collect -> ["x1","x2"]', /x1/.test(sink) && /x2/.test(sink), `sink=${JSON.stringify(sink)}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
