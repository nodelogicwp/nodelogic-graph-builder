/* Feed the REAL editor bundle malformed / legacy / partial graphState and
 * verify it mounts without crashing and Save produces a defined formula. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = require('path').resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(require('path').join(ROOT, "dist", "build", "elementor.js"), 'utf8');

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };

function makeWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const errs = [];
  w.addEventListener('error', (e) => errs.push(e.message || String(e.error)));
  const origErr = w.console.error; w.console.error = (...a) => { errs.push(a.map(String).join(' ')); origErr.apply(w.console, a); };
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return { w, errs };
}

function tryMount(label, graphState) {
  return new Promise((resolve) => {
    const { w, errs } = makeWindow();
    let mounted = false, formula, threw;
    try {
      w.mountElementorLogicEditor(w.document.getElementById('host'), {
        editorId: 'e', graphState,
        onStateChange: () => {}, onFormulaChange: (f) => { formula = f; },
      });
      mounted = true;
    } catch (e) { threw = e.message; }
    setTimeout(() => {
      // try clicking Save Graph if present
      try {
        const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
        if (b) b.click();
      } catch (e) { errs.push('save click: ' + e.message); }
      setTimeout(() => {
        const reactErrs = errs.filter((e) => /Cannot read|undefined is not|is not a function|Maximum call stack|TypeError|is not iterable/i.test(String(e)));
        resolve({ label, mounted, threw, formula, reactErrs });
      }, 300);
    }, 450);
  });
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

const cases = {
  'empty object': {},
  'null elements/connections': { elements: null, connections: null, formula: null },
  'elements as object map': { elements: { a: { id: 'a', type: 'number', x: 0, y: 0, data: { value: 3 } } }, connections: [], formula: '' },
  'connection referencing missing nodes': { elements: [{ id: 'n', type: 'number', x: 0, y: 0, data: {} }], connections: [{ id: 'c', fromId: 'ghost1', fromOutput: 'output0', toId: 'ghost2', toInput: 'input0' }], formula: '' },
  'unknown node type': { elements: [{ id: 'x', type: 'totally-unknown-node-type', x: 0, y: 0, data: {} }, { id: 'o', type: 'output', x: 0, y: 0, data: { selectedElement: 's' } }], connections: [{ id: 'c', fromId: 'x', fromOutput: 'output0', toId: 'o', toInput: 'input1' }], formula: '' },
  'node missing id / data': { elements: [{ type: 'number', x: 0, y: 0 }, { id: 'o', type: 'output' }], connections: [], formula: '' },
  'legacy: output node without outputTargetElementPin + input0 wire': {
    elements: [
      { id: 'n', type: 'number', x: 0, y: 0, data: { value: 7 } },
      { id: 'o', type: 'output', x: 0, y: 0, data: { selectedElement: 'sink' } },
    ],
    connections: [{ id: 'c', fromId: 'n', fromOutput: 'output0', toId: 'o', toInput: 'input0' }],
    formula: '',
  },
  'legacy: number node with arrayTypeCarrier:true': {
    elements: [
      { id: 'n', type: 'number', valueType: 'array', x: 0, y: 0, data: { value: 42, arrayTypeCarrier: true } },
      { id: 'len', type: 'array-length', x: 0, y: 0, data: {} },
      { id: 'o', type: 'output', x: 0, y: 0, data: { outputTargetElementPin: true, selectedElement: 'sink' } },
    ],
    connections: [
      { id: 'c1', fromId: 'n', fromOutput: 'output0', toId: 'len', toInput: 'input0' },
      { id: 'c2', fromId: 'len', fromOutput: 'output0', toId: 'o', toInput: 'input1' },
    ],
    formula: '',
  },
  'circular connection': {
    elements: [{ id: 'a', type: 'concat', x: 0, y: 0, data: {} }, { id: 'b', type: 'concat', x: 0, y: 0, data: {} }],
    connections: [
      { id: 'c1', fromId: 'a', fromOutput: 'output0', toId: 'b', toInput: 'input0' },
      { id: 'c2', fromId: 'b', fromOutput: 'output0', toId: 'a', toInput: 'input0' },
    ],
    formula: '',
  },
  'deeply nested string': { elements: [], connections: [], formula: '', customNodeUi: 'not-an-object', updatedAt: 'yesterday' },
};

(async () => {
  for (const [label, gs] of Object.entries(cases)) {
    const r = await tryMount(label, gs);
    ok(`mounts without throwing: ${label}`, r.mounted && !r.threw, r.threw || 'threw');
    ok(`no React/TypeError while handling: ${label}`, r.reactErrs.length === 0, r.reactErrs.join(' | '));
    ok(`Save yields a string formula (or ""): ${label}`, typeof r.formula === 'string', `formula=${JSON.stringify(r.formula)}`);
  }
  // the arrayTypeCarrier legacy case: formula must NOT contain a bare [42]
  {
    const r = await tryMount('arrayTypeCarrier formula check', cases['legacy: number node with arrayTypeCarrier:true']);
    ok('legacy arrayTypeCarrier: formula has no bare [42] collision literal', !/[^"\w]\[42\]/.test(String(r.formula)), JSON.stringify(r.formula));
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
