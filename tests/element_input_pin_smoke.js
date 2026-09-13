/* Element input pin architecture + the actual root cause of "the reproduction
 * is still failing" after the Output same-target-key-collision fix.
 *
 * ROOT CAUSE (found by tracing editor state -> compiled expression -> runtime
 * for the exact reported graph): `Get Element Property` had NO Element ID
 * control at all -- its only way to target an element was a wired Element
 * input pin (input0). If that pin is left unconnected (a graph shape the
 * user's report indicates -- comparing "Get Element Property using its
 * Element ID control" against "using a dynamically connected Element input
 * pin", which only makes sense if the node has BOTH), the compiler emitted
 * `connectedInputExpression(0, 'null')` -> the literal string "null" ->
 * `__nodeGetElementProp(null, "textContent")` -> ALWAYS returns null,
 * regardless of DOM state, caching, or the earlier Output-key-collision fix.
 * "Add 1" then always computed from that constant null (via __nodeToNumber's
 * fallback), never from the real element -- not stale, simply never reading
 * the DOM at all. This has nothing to do with formulaEvaluationCache, event
 * listeners, or output key collisions (all already fixed/ruled out this
 * session) -- it is a genuinely separate, compile-time gap: the node had no
 * fallback to fall back TO.
 *
 * FIX: every node with a UI control for selecting/entering an Element ID
 * (and whose purpose is to OPERATE on that element, not resolve/return it)
 * now exposes the same Element input pin architecture Output already had:
 * a connected pin wins; otherwise its own ID control (added where it did not
 * exist) resolves the current element via the same __nodeGetElement lookup.
 * Nodes changed: element-property (Get Element Property), get-children (Get
 * Children), image-from-element (fixed a pre-existing DEAD id field the
 * compiler silently ignored), action-event (Action Event Node, new pin at
 * input1 -- input0 stays the existing 'action' attach-to-Output slot).
 * Intentionally excluded: element-ref (Element Reference) and element-id --
 * their purpose IS to resolve/return an element/id value, not operate on a
 * target using one; event-hover/event-scroll/event-element are identified as
 * architecturally qualifying but deferred (their listener registry is
 * string-keyed and shared with __nodeEventProcessor's consumption tracking;
 * safely accepting a live element needs a new durable-identity primitive,
 * out of scope for this pass).
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

function makeEditorWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
async function compileFormula(graph) {
  const w = makeEditorWindow();
  const fcalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: graph, onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(500);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  b.click();
  await wait(300);
  return { formula: fcalls[fcalls.length - 1], win: w };
}
function bootRuntime(bodyHtml, formula) {
  const html = `<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div>
  </body>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  w.document.getElementById('lb').setAttribute('data-formula', formula);
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return w;
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  /* ============================================================
   * 1/2. THE exact reported graph: Get Element -> Output(value=1),
   *      plus Event -> Get Element Property (via its NEW Element ID
   *      control, nothing wired to its pin) -> Add 1 -> Output.
   *      3 consecutive event executions must read the value the
   *      PREVIOUS execution wrote: 1 -> 2 -> 3 -> 4.
   * ============================================================ */
  {
    const g = {
      elements: [
        mk('elrefInit', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
        mk('const1', 'number', { value: 1 }),
        mk('out1', 'output', { outputTargetElementPin: true }),

        mk('evt', 'event-custom', { eventCustomName: 'tick' }),
        // Get Element Property via its (new) own Element ID control -- NOT wired.
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent', elementUseManualId: true, customElementId: 'target' }),
        mk('toNum', 'string-to-number', {}),
        mk('one', 'number', { value: 1 }),
        mk('eventProc', 'event-processor', { passOnlyOnEvent: true }),
        mk('fallback', 'fallback', {}),
        mk('zero', 'number', { value: 0 }),
        mk('add1', 'calculation', { operation: '+' }),
        mk('elrefOut2', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
        mk('out2', 'output', { outputTargetElementPin: true }),
      ],
      connections: [
        cn('a0', 'elrefInit', 'output0', 'out1', 'input0'),
        cn('a1', 'const1', 'output0', 'out1', 'input1'),
        cn('b1', 'prop', 'output0', 'toNum', 'input0'), // note: nothing wired to prop.input0
        cn('c0', 'evt', 'output0', 'eventProc', 'input0'),
        cn('c1', 'one', 'output0', 'eventProc', 'input1'),
        cn('c2', 'eventProc', 'output0', 'fallback', 'input0'),
        cn('c3', 'zero', 'output0', 'fallback', 'input1'),
        cn('d0', 'toNum', 'output0', 'add1', 'input0'),
        cn('d1', 'fallback', 'output0', 'add1', 'input1'),
        cn('e0', 'elrefOut2', 'output0', 'out2', 'input0'),
        cn('e1', 'add1', 'output0', 'out2', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const { formula } = await compileFormula(g);
    ok('1a) compiled: Get Element Property (unwired) resolves via __nodeGetElement, not null',
      /__nodeGetElementProp\(__nodeGetElement\("target"\), "textContent"\)/.test(formula), formula);

    const w = bootRuntime('<div id="target" data-nodelogic-id="target">unset</div>', formula);
    await wait(80);
    const target = w.document.getElementById('target');
    target.textContent = '1'; // Output #1's documented initialization value

    const expected = [2, 3, 4];
    for (let i = 0; i < 3; i++) {
      w.dispatchEvent(new w.CustomEvent('tick'));
      await wait(80);
      ok(`2) execution #${i + 1}: reads the value the previous execution wrote (-> ${expected[i]})`,
        target.textContent === String(expected[i]), target.textContent);
    }
  }

  /* ============================================================
   * 3. Element input pin CONNECTED to Get Element Property.
   * 4. Same node with the pin disconnected, using its Element ID
   *    control as fallback -- both resolve the SAME live element.
   * ============================================================ */
  {
    // 3: pin connected
    const gWired = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'w' }),
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('out', 'output', { selectedElement: 'sink' }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'prop', 'input0'),
        cn('b', 'prop', 'output0', 'out', 'input0'),
      ],
      formula: '', updatedAt: 0,
    };
    const { formula: fWired } = await compileFormula(gWired);
    ok('3) Element pin connected: sourceExpr comes from the wired node (__nodeGetElement("w"))',
      /__nodeGetElementProp\(__nodeGetElement\("w"\), "textContent"\)/.test(fWired), fWired);
    const wWired = bootRuntime('<div id="w" data-nodelogic-id="w">wired-value</div><div id="sink" data-nodelogic-id="sink">-</div>', fWired);
    await wait(80);
    ok('3b) runtime: wired Element pin resolves the connected element',
      wWired.document.getElementById('sink').textContent === 'wired-value', wWired.document.getElementById('sink').textContent);

    // 4: pin disconnected, ID control fallback
    const gFallback = {
      elements: [
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent', elementUseManualId: true, customElementId: 'w2' }),
        mk('out', 'output', { selectedElement: 'sink2' }),
      ],
      connections: [cn('b', 'prop', 'output0', 'out', 'input0')],
      formula: '', updatedAt: 0,
    };
    const { formula: fFallback } = await compileFormula(gFallback);
    ok('4) Element pin disconnected: sourceExpr comes from the ID control (__nodeGetElement("w2"))',
      /__nodeGetElementProp\(__nodeGetElement\("w2"\), "textContent"\)/.test(fFallback), fFallback);
    const wFallback = bootRuntime('<div id="w2" data-nodelogic-id="w2">fallback-value</div><div id="sink2" data-nodelogic-id="sink2">-</div>', fFallback);
    await wait(80);
    ok('4b) runtime: ID-control fallback resolves the same way as the pin',
      wFallback.document.getElementById('sink2').textContent === 'fallback-value', wFallback.document.getElementById('sink2').textContent);
  }

  /* ============================================================
   * 5. Nodes whose purpose IS to resolve/return an Element reference
   *    must NOT receive an unnecessary Element input pin.
   * ============================================================ */
  {
    const { win } = await compileFormula({ elements: [mk('r', 'element-ref', {})], connections: [], formula: '', updatedAt: 0 });
    const doc = win.document;
    // 0 input pins for element-ref: no ".pin.input" elements should exist for it.
    const card = doc.querySelector('[data-element-id="r"]');
    const pins = card ? card.querySelectorAll('.pin.input, [class*="pin-input"]') : null;
    ok('5) element-ref (Reference) gets no Element input pin (its output IS the reference)',
      !card || !pins || pins.length === 0, card ? card.outerHTML.slice(0, 200) : 'no card');
  }

  /* ============================================================
   * 6. Existing Output Element-pin behavior is unchanged.
   * ============================================================ */
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'out-target' }),
        mk('c', 'number', { value: 5 }),
        mk('out', 'output', { outputTargetElementPin: true }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'out', 'input0'),
        cn('b', 'c', 'output0', 'out', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const { formula } = await compileFormula(g);
    ok('6) Output Element pin: unchanged compiled shape (__element / __executeOnLoad / value)',
      /"__element":\s*__nodeGetElement\("out-target"\)/.test(formula) && /"__executeOnLoad":\s*true/.test(formula) && /"value":\s*5/.test(formula),
      formula);
  }

  /* ============================================================
   * Bonus: image-from-element's previously-dead elementSelector
   * fallback now actually resolves an element when unwired.
   * ============================================================ */
  {
    const g = {
      elements: [
        mk('img', 'image-from-element', { elementSelector: 'srcEl' }),
        mk('out', 'output', { selectedElement: 'sink3' }),
      ],
      connections: [cn('a', 'img', 'output0', 'out', 'input0')],
      formula: '', updatedAt: 0,
    };
    const { formula } = await compileFormula(g);
    ok('bonus) image-from-element: elementSelector fallback now wired into the compiler (was silently ignored before)',
      /__nodeImageFromElement\(__nodeGetElement\("srcEl"\)\)/.test(formula), formula);
  }

  /* ============================================================
   * Bonus: action-event's new Element pin (input1) does not
   * collide with input0 (the existing 'action' attach-to-Output
   * slot) and correctly targets a dynamically wired element.
   * ============================================================ */
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'src' }),
        mk('actEvt', 'action-event', { actionEventType: 'click' }),
        mk('setTxt', 'action-set-text', { valueText: 'hit' }),
        mk('elrefOut', 'element-ref', { elementUseManualId: true, customElementId: 'sink4' }),
        mk('out', 'output', { outputTargetElementPin: true }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'actEvt', 'input1'),
        cn('b', 'actEvt', 'output0', 'setTxt', 'input0'),
        cn('c', 'elrefOut', 'output0', 'out', 'input0'),
        cn('d', 'out', 'output0', 'actEvt', 'input0'),
      ],
      formula: '', updatedAt: 0,
    };
    const { formula } = await compileFormula(g);
    ok('bonus) action-event: __element (input1) and __nodeId present, actions still attached to Output',
      /"__element":\s*__nodeGetElement\("src"\)/.test(formula) && /type: "setText", value: "hit"/.test(formula),
      formula);
    const w = bootRuntime('<button id="src">Click</button><div id="sink4" data-nodelogic-id="sink4">-</div>', formula);
    await wait(80);
    w.document.getElementById('src').dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('bonus) action-event: wired Element pin listener fires and sets text',
      w.document.getElementById('sink4').textContent === 'hit', w.document.getElementById('sink4').textContent);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
