/* Pointer / wheel isolation for scrollable config sub-panels inside a node card.
 *
 * Real dist/build/elementor.js mounted in jsdom.
 *
 *  A. wheel over the Element Property "Properties" list (.nl-scroll-guard):
 *     - the canvas must NOT zoom
 *     - the wheel event must NOT be preventDefault()-ed (browser scrolls the list)
 *  B. mousedown inside .nl-scroll-guard (its scrollbar) + move + release:
 *     - the node must NOT move
 *  Controls: wheel on the bare canvas DOES zoom; drag from the node header DOES
 *  move the node.
 *
 * jsdom has no real scrollbars, so "the list actually scrolls" is a manual
 * check (see RELEASE_CHECKLIST.md); what is covered here is that the editor's
 * own zoom / node-drag handlers no longer fire for these gestures.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}

const GRAPH = {
  elements: [
    mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'list' }),
    mk('prop', 'element-property', {
      elementPropertyMode: 'custom',
      elementPropertySelected: [
        { key: 'textContent', origin: 'custom' }, { key: 'id', origin: 'custom' },
        { key: 'className', origin: 'custom' }, { key: 'title', origin: 'custom' },
        { key: 'href', origin: 'custom' }, { key: 'src', origin: 'custom' },
        { key: 'value', origin: 'custom' }, { key: 'name', origin: 'custom' },
      ],
    }),
    mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
  ],
  connections: [
    cn('a', 'elref', 'output0', 'prop', 'input0'),
    cn('b', 'prop', 'output0', 'out', 'input1'),
  ],
  formula: '', updatedAt: 0,
};

async function mount() {
  const w = makeWindow();
  const scalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: JSON.parse(JSON.stringify(GRAPH)),
    onStateChange: (st) => scalls.push(st), onFormulaChange: () => {},
  });
  await wait(550);
  const doc = w.document;
  const card = doc.querySelector('.canvas-element[data-element-id="prop"]');
  // select + expand the Properties list
  for (const t of ['mousedown', 'mouseup', 'click']) {
    card.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  }
  await wait(120);
  const toggle = Array.from(doc.querySelectorAll('button')).find((b) => /^Properties\b/.test((b.textContent || '').trim()));
  if (toggle) { toggle.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); }
  await wait(120);
  return { w, doc, scalls, saveAndRead() {
    const b = Array.from(doc.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    return new Promise((res) => setTimeout(() => res(scalls[scalls.length - 1]), 250));
  } };
}
const nodeXY = (st) => { const p = ((st || {}).elements || []).find((e) => e.id === 'prop'); return p ? `${p.x},${p.y}` : null; };

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  /* ---- structural ---- */
  {
    const { doc } = await mount();
    const guard = doc.querySelector('.canvas-element[data-element-id="prop"] .nl-scroll-guard');
    ok('the Element Property Properties list renders with class .nl-scroll-guard', !!guard,
      'no .nl-scroll-guard found in the element-property node');
    ok('the .nl-scroll-guard list is a scroll container (overflow-y:auto, bounded height)',
      !!guard && /auto|scroll/.test(guard.style.overflowY) && !!guard.style.maxHeight, guard && guard.style.cssText);
  }

  /* ---- A. wheel isolation ---- */
  {
    const { w, doc } = await mount();
    const canvas = doc.querySelector('.canvas');
    const guard = doc.querySelector('.canvas-element[data-element-id="prop"] .nl-scroll-guard');
    const row = guard.querySelector('div') || guard;

    const bgBefore = canvas.style.backgroundSize;
    const evt = new w.WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: 40, clientY: 40 });
    row.dispatchEvent(evt);
    await wait(80);

    ok('A: wheel over the Properties list does NOT zoom the canvas',
      canvas.style.backgroundSize === bgBefore, `bg ${bgBefore} -> ${canvas.style.backgroundSize}`);
    ok('A: wheel over the Properties list is NOT preventDefault()-ed (native scroll survives)',
      evt.defaultPrevented === false, 'defaultPrevented=true');
  }

  /* ---- A control: bare canvas still zooms ---- */
  {
    const { w, doc } = await mount();
    const canvas = doc.querySelector('.canvas');
    const bgBefore = canvas.style.backgroundSize;
    const evt = new w.WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true, clientX: 400, clientY: 300 });
    canvas.dispatchEvent(evt);
    await wait(80);
    ok('A control: wheel on the bare canvas DOES zoom',
      canvas.style.backgroundSize !== bgBefore, `bg unchanged: ${canvas.style.backgroundSize}`);
    ok('A control: canvas wheel IS preventDefault()-ed', evt.defaultPrevented === true, 'not prevented');
  }

  /* ---- B. scrollbar / pointer isolation ---- */
  {
    const { w, doc, saveAndRead } = await mount();
    const before = nodeXY(await saveAndRead());
    const guard = doc.querySelector('.canvas-element[data-element-id="prop"] .nl-scroll-guard');
    const row = guard.querySelector('div') || guard;

    row.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 80, clientY: 80 }));
    await wait(20);
    doc.querySelector('.canvas').dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 320, clientY: 300 }));
    await wait(20);
    w.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 320, clientY: 300 }));
    doc.querySelector('.canvas').dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 320, clientY: 300 }));
    await wait(60);

    const after = nodeXY(await saveAndRead());
    ok('B: dragging inside the Properties list (scrollbar) does NOT move the node',
      before !== null && before === after, `node moved ${before} -> ${after}`);
  }

  /* ---- B control: node header still drags ---- */
  {
    const { w, doc, saveAndRead } = await mount();
    const before = nodeXY(await saveAndRead());
    const header = doc.querySelector('.canvas-element[data-element-id="prop"] .node-header');

    header.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 60, clientY: 60 }));
    await wait(20);
    doc.querySelector('.canvas').dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: 140, clientY: 130 }));
    await wait(20);
    doc.querySelector('.canvas').dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 140, clientY: 130 }));
    await wait(60);

    const after = nodeXY(await saveAndRead());
    ok('B control: dragging from the node header DOES move the node',
      before !== null && after !== null && before !== after, `node did not move (${before})`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
