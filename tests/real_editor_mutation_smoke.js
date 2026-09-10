/* REAL editor bundle: graph mutation stress — delete a middle node in a wired
 * chain, verify no crash, formula regenerates without the deleted node, and the
 * downstream node degrades gracefully. */
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
  const errs = [];
  w.addEventListener('error', (e) => errs.push(e.message || String(e.error)));
  const oe = w.console.error; w.console.error = (...a) => { errs.push(a.map(String).join(' ')); oe.apply(w.console, a); };
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return { w, errs };
}
const clickSave = (w) => { const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || '')); if (b) b.click(); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  const graph = {
    elements: [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
      mk('gc', 'get-children', { getChildrenMode: 'single', getChildrenSingleIndex: 0 }),
      mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
      mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink-1' }),
    ],
    connections: [
      cn('a', 'elref', 'output0', 'gc', 'input0'),
      cn('b', 'gc', 'output0', 'prop', 'input0'),
      cn('c', 'prop', 'output0', 'o', 'input1'),
    ],
    formula: '', updatedAt: 0,
  };

  const { w, errs } = makeWindow();
  const fcalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: graph, onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(500);
  clickSave(w);
  await wait(300);
  const before = fcalls[fcalls.length - 1];
  ok('baseline formula references the child', /__nodeGetChildAt/.test(before || ''), JSON.stringify(before));

  // select the get-children node canvas element, then press Delete
  const gcEl = w.document.querySelector('[data-element-id="gc"]');
  ok('canvas element for gc rendered', !!gcEl);
  if (gcEl) {
    gcEl.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    gcEl.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0 }));
    await wait(100);
    // Delete key
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await wait(200);
  }

  const gcGone = !w.document.querySelector('[data-element-id="gc"]');
  ok('get-children node removed from canvas', gcGone, 'still present');
  const noConnToGc = !w.document.body.innerHTML.includes('"gc"'); // loose
  clickSave(w);
  await wait(300);
  const after = fcalls[fcalls.length - 1];
  ok('formula regenerated after delete (string)', typeof after === 'string', JSON.stringify(after));
  ok('formula no longer contains __nodeGetChildAt', !/__nodeGetChildAt/.test(after || ''), JSON.stringify(after));
  ok('downstream element-property degraded gracefully (formula has "0" or no prop call for it)',
    !/__nodeGetElementProp\(__nodeGetChildAt/.test(after || ''), JSON.stringify(after));

  const realErrs = errs.filter((e) => /Cannot read|is not a function|Maximum call stack|undefined is not|is not iterable/i.test(String(e)));
  ok('no TypeError/crash during select+delete+save', realErrs.length === 0, realErrs.join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
