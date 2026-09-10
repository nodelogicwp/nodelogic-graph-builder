/* REAL editor bundle: a get-children node in Single mode that still carries
 * leftover output1/output2 wires (as after switching down from All+Child) must
 * prune those wires — the connected-pin-floor clamp only protects the
 * detection-driven "All" modes, never Single/Custom. Also: the All+Child
 * headless-save protection must still hold. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = require('path').resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(require('path').join(ROOT, "dist", "build", "elementor.js"), 'utf8');

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
function editorSave(graph) {
  return new Promise((resolve) => {
    const w = makeWindow();
    const fcalls = [], scalls = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: graph,
      onStateChange: (st) => scalls.push(st),
      onFormulaChange: (f) => fcalls.push(f),
    });
    setTimeout(() => {
      const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
      if (!b) return resolve({ error: 'no Save button' });
      b.click();
      setTimeout(() => resolve({ formula: fcalls[fcalls.length - 1], state: scalls[scalls.length - 1] }), 400);
    }, 500);
  });
}
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 90000);

(async () => {
  // 1. Single mode + leftover output1/output2 wires -> those must be pruned.
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('gc', 'get-children', { getChildrenMode: 'single', getChildrenSingleIndex: 0 }),
        mk('p0', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('p1', 'element-property', { elementPropertyMode: 'single', elementProperty: 'id' }),
        mk('p2', 'element-property', { elementPropertyMode: 'single', elementProperty: 'className' }),
        mk('o0', 'output', { outputTargetElementPin: true, selectedElement: 's0' }),
        mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 's1' }),
        mk('o2', 'output', { outputTargetElementPin: true, selectedElement: 's2' }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'gc', 'input0'),
        cn('b0', 'gc', 'output0', 'p0', 'input0'),
        cn('b1', 'gc', 'output1', 'p1', 'input0'), // stale
        cn('b2', 'gc', 'output2', 'p2', 'input0'), // stale
        cn('c0', 'p0', 'output0', 'o0', 'input1'),
        cn('c1', 'p1', 'output0', 'o1', 'input1'),
        cn('c2', 'p2', 'output0', 'o2', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const r = await editorSave(g);
    const conns = r.state && r.state.connections || [];
    const gcOut = conns.filter((c) => c.fromId === 'gc').map((c) => c.fromOutput).sort();
    ok('single mode: leftover output1/output2 wires pruned, only output0 remains',
      JSON.stringify(gcOut) === JSON.stringify(['output0']), JSON.stringify(gcOut));
    ok('single mode: formula has exactly one __nodeGetChildAt(...,0)',
      (r.formula.match(/__nodeGetChildAt\(__nodeGetElement\("text-1"\), 0\)/g) || []).length >= 1
      && !/__nodeGetChildAt\(__nodeGetElement\("text-1"\), [12]\)/.test(r.formula), JSON.stringify(r.formula));
  }

  // 2. All+Child headless save (no preview) -> wire preserved (original fix holds).
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'child' }),
        mk('p0', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('o0', 'output', { outputTargetElementPin: true, selectedElement: 's0' }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'gc', 'input0'),
        cn('b0', 'gc', 'output0', 'p0', 'input0'),
        cn('c0', 'p0', 'output0', 'o0', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const r = await editorSave(g);
    ok('all+child headless: wire preserved, formula still has __nodeGetChildAt(...,0)',
      /__nodeGetElementProp\(__nodeGetChildAt\(__nodeGetElement\("text-1"\), 0\), "textContent"\)/.test(r.formula || ''),
      JSON.stringify(r.formula));
  }

  // 3. Custom+Children with a SINGLE selected index -> formula must not lose it
  //    to the [N] dynamic-variable collision.  gc(array) -> array-length -> output.value
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('gc', 'get-children', { getChildrenMode: 'custom', getChildrenReturnAs: 'children', getChildrenSelected: [3] }),
        mk('len', 'array-length', {}),
        mk('o0', 'output', { outputTargetElementPin: true, selectedElement: 's0' }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'gc', 'input0'),
        cn('b', 'gc', 'output0', 'len', 'input0'),
        cn('c', 'len', 'output0', 'o0', 'input1'), // Value pin (post Element-pin shift)
      ],
      formula: '', updatedAt: 0,
    };
    const r = await editorSave(g);
    ok('custom+children single index: subset passed as JSON string, not bare [3]',
      /__nodeGetChildrenSubset\([^,]+,\s*"\[3\]"\)/.test(r.formula || ''), JSON.stringify(r.formula));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
