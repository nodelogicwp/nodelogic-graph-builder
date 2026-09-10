/* REAL editor bundle (dist/build/elementor.js) -> click Save Graph -> capture
 * formula -> run through REAL frontend.js. Reproduces the headless-save
 * condition (no Elementor preview iframe => zero live child detection), which
 * used to make pruneStaleDynamicOutputConnections delete every wire out of a
 * Get Children node in "Return as: Child" mode. */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const ROOT = require('path').resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(require('path').join(ROOT, "dist", "build", "elementor.js"), 'utf8');
const FRONT = fs.readFileSync(require('path').join(ROOT, "frontend.js"), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:x=>String(x).replace(/[^a-zA-Z0-9_-]/g,c=>"\\\\"+c)};';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };

const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });

function makeWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', {
    runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE;
  w.document.body.appendChild(s);
  return w;
}

function editorFormula(graph) {
  return new Promise((resolve) => {
    const w = makeWindow();
    const calls = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: graph, onStateChange: () => {}, onFormulaChange: (f) => calls.push(f),
    });
    setTimeout(() => {
      const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
      if (!b) return resolve({ error: 'no Save button' });
      b.click();
      setTimeout(() => resolve({ formula: calls[calls.length - 1] }), 350);
    }, 450);
  });
}

function frontendRun(formula, bodyHtml) {
  const html = `<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div></body>`;
  const fd = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/' });
  fd.window.eval(CSSP);
  fd.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const sc = fd.window.document.createElement('script'); sc.textContent = FRONT;
  fd.window.document.body.appendChild(sc);
  fd.window.document.dispatchEvent(new fd.window.Event('DOMContentLoaded', { bubbles: true }));
  const t = (s) => { const e = fd.window.document.querySelector(s); return e ? e.textContent.trim() : null; };
  return { h2: t('[data-nodelogic-id="text-1"] h2'), sink: t('#sink-1') };
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 90000);

(async () => {
  const H2 = '<div data-nodelogic-id="text-1"><h2>Hello</h2></div>';
  const SINK = '<div id="sink-1">x</div>';

  // 1. Get Children (all + child) -> Element Property (single) -> Output value
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'child' }),
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink-1' }),
      ],
      connections: [cn('a', 'elref', 'output0', 'gc', 'input0'), cn('b', 'gc', 'output0', 'prop', 'input0'), cn('c', 'prop', 'output0', 'out', 'input1')],
      formula: '', updatedAt: 0,
    };
    const { formula, error } = await editorFormula(g);
    ok('all+child -> Property: formula keeps __nodeGetChildAt (no "null")',
      !error && /__nodeGetElementProp\(__nodeGetChildAt\(__nodeGetElement\("text-1"\), 0\), "textContent"\)/.test(formula || ''),
      error || JSON.stringify(formula));
    const r = frontendRun(formula, H2 + SINK);
    ok('all+child -> Property: frontend reads the h2 text ("Hello")', r.sink === 'Hello', JSON.stringify(r));
  }

  // 2. Get Children (all + child) -> Output.Element + Set Text
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'child' }),
        mk('sc', 'constant-string', { value: 'Changed' }),
        mk('st', 'action-set-text', { valueText: 'Changed' }),
        mk('out2', 'output', { outputTargetElementPin: true }),
      ],
      connections: [cn('a', 'elref', 'output0', 'gc', 'input0'), cn('b', 'gc', 'output0', 'out2', 'input0'), cn('c', 'sc', 'output0', 'out2', 'input1'), cn('d', 'out2', 'output0', 'st', 'input0')],
      formula: '', updatedAt: 0,
    };
    const { formula, error } = await editorFormula(g);
    ok('all+child -> Output.Element: formula carries __element child expr',
      !error && /"__element":\s*__nodeGetChildAt\(__nodeGetElement\("text-1"\), 0\)/.test(formula || '') && formula !== '',
      error || JSON.stringify(formula));
    ok('all+child -> Output.Element: placeholder key has no NUL byte',
      !!formula && formula.indexOf('\u0000') === -1, 'NUL present in ' + JSON.stringify(formula));
    const r = frontendRun(formula, H2);
    ok('all+child -> Output.Element -> Set Text: real h2 becomes "Changed"', r.h2 === 'Changed', JSON.stringify(r));
  }

  // 3. single mode still fine (no regression)
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('gc', 'get-children', { getChildrenMode: 'single', getChildrenSingleIndex: 0 }),
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink-1' }),
      ],
      connections: [cn('a', 'elref', 'output0', 'gc', 'input0'), cn('b', 'gc', 'output0', 'prop', 'input0'), cn('c', 'prop', 'output0', 'out', 'input1')],
      formula: '', updatedAt: 0,
    };
    const { formula } = await editorFormula(g);
    const r = frontendRun(formula, H2 + SINK);
    ok('single mode: still resolves the child (no regression)', r.sink === 'Hello', JSON.stringify({ formula, r }));
  }

  // 4. legitimate pruning still happens: Get Children flipped to children/array
  //    while wired into an element-only input -> that wire must be dropped.
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }), // ARRAY output
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink-1' }),
      ],
      connections: [cn('a', 'elref', 'output0', 'gc', 'input0'), cn('b', 'gc', 'output0', 'prop', 'input0'), cn('c', 'prop', 'output0', 'out', 'input1')],
      formula: '', updatedAt: 0,
    };
    const { formula } = await editorFormula(g);
    // array -> element input is incompatible; the gc->prop wire is pruned, so
    // Property has no source and the entry collapses (0 / "null" / dropped).
    ok('children/array into element input: incompatible wire still pruned',
      !/__nodeGetChildAt/.test(formula || ''), JSON.stringify(formula));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
