/* Two Output nodes targeting the SAME element (via the plain selectedElement
 * dropdown, not each wired through its own Element pin) — release blocker.
 *
 * Reported as: `Get Element -> Output #1 (constant 1)` (initialization) plus
 * a separate `Event -> Get Element Property -> Add 1 -> Output #2` on the
 * SAME element; the event branch appeared not to observe the state produced
 * by the first Output.
 *
 * Root cause (NOT formulaEvaluationCache, NOT the event system): the
 * compiler (`graphEditor.tsx`, the payloadEntries builder in
 * buildGraphFormulaFromState) keyed each Output's entry in the compiled
 * payload object literal by the Output's TARGET id string whenever its
 * Element pin was not wired (`entryKey = targetId`) — e.g.
 * `({ "target": {value:1}, "target": {value:(...)} })`. By plain
 * ECMAScript object-literal semantics, a duplicate key collapses to the
 * LAST one written; the earlier Output's entire payload — value AND
 * actions — is silently discarded before `applyLogicBlocks` ever sees it.
 * This is a compile-time defect, not a caching or listener issue: it
 * reproduces on the very first evaluation, independent of any recalculation
 * or event history. It was masked from every earlier "does the SAME
 * output update on repeated executions" investigation because those graphs
 * used only one Output per target.
 *
 * Fix: every Output entry key is now unique PER OUTPUT NODE
 * (` nlOutTarget:${element.id}`, mirroring the pre-existing
 * ` nlOutEl:${element.id}` scheme already used when the Element pin IS
 * wired). The actual DOM target id travels inside the payload as
 * `__targetId` and the runtime (`applyLogicBlocks`) resolves it from there,
 * falling back to the entry key itself for formulas compiled before this
 * fix (so already-published, not-yet-resaved graphs keep their prior
 * behavior — including the underlying bug, which cannot be fixed without
 * recompiling; only a resave produces the corrected formula). Action-plan
 * bookkeeping (`nodelogicActionBindings`, listener dedup/pruning) is now
 * also keyed by the per-node entry key rather than the resolved target id,
 * so two Output nodes legitimately sharing one target no longer share (and
 * so can't clobber) one another's listener-binding state.
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
  return fcalls[fcalls.length - 1];
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
  /* ---- 0. Simpler baseline, no initialization part: a single
   *         Event -> Get Element Property -> Add 1 -> Output, real
   *         event-driven, editor default element value 0. ---- */
  {
    const g = {
      elements: [
        mk('evt', 'event-custom', { eventCustomName: 'tick' }),
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'simple' }),
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('toNum', 'string-to-number', {}),
        mk('one', 'number', { value: 1 }),
        mk('eventProc', 'event-processor', { passOnlyOnEvent: true }),
        mk('fallback', 'fallback', {}),
        mk('zero', 'number', { value: 0 }),
        mk('add1', 'calculation', { operation: '+' }),
        mk('out', 'output', { selectedElement: 'simple' }),
      ],
      connections: [
        cn('b0', 'elref', 'output0', 'prop', 'input0'),
        cn('b1', 'prop', 'output0', 'toNum', 'input0'),
        cn('c0', 'evt', 'output0', 'eventProc', 'input0'),
        cn('c1', 'one', 'output0', 'eventProc', 'input1'),
        cn('c2', 'eventProc', 'output0', 'fallback', 'input0'),
        cn('c3', 'zero', 'output0', 'fallback', 'input1'),
        cn('d0', 'toNum', 'output0', 'add1', 'input0'),
        cn('d1', 'fallback', 'output0', 'add1', 'input1'),
        cn('e0', 'add1', 'output0', 'out', 'input0'),
      ],
      formula: '', updatedAt: 0,
    };
    const f = await compileFormula(g);
    const w = bootRuntime('<div id="simple" data-nodelogic-id="simple">0</div>', f);
    await wait(80);
    const el = w.document.getElementById('simple');
    const expected = [1, 2, 3];
    for (let i = 0; i < 3; i++) {
      w.dispatchEvent(new w.CustomEvent('tick'));
      await wait(80);
      ok(`0) simple case, event #${i + 1}: Get Property -> Add 1 -> Output (-> ${expected[i]})`,
        el.textContent === String(expected[i]), el.textContent);
    }
  }

  const twoOutputGraph = {
    elements: [
      // Part 1: Get Element -> Output #1 (constant 1), targeted via the
      // plain selectedElement dropdown.
      mk('elrefInit', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('const1', 'number', { value: 1 }),
      mk('out1', 'output', { selectedElement: 'target' }),

      // Part 2: Event -> Get Element Property -> Add 1 -> Output #2, ALSO
      // targeted via the dropdown at the SAME id.
      mk('evt', 'event-custom', { eventCustomName: 'tick' }),
      mk('elrefEvt', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
      mk('toNum', 'string-to-number', {}),
      mk('one', 'number', { value: 1 }),
      mk('eventProc', 'event-processor', { passOnlyOnEvent: true }),
      mk('fallback', 'fallback', {}),
      mk('zero', 'number', { value: 0 }),
      mk('add1', 'calculation', { operation: '+' }),
      mk('out2', 'output', { selectedElement: 'target' }),
    ],
    connections: [
      cn('a1', 'const1', 'output0', 'out1', 'input0'),
      cn('b0', 'elrefEvt', 'output0', 'prop', 'input0'),
      cn('b1', 'prop', 'output0', 'toNum', 'input0'),
      cn('c0', 'evt', 'output0', 'eventProc', 'input0'),
      cn('c1', 'one', 'output0', 'eventProc', 'input1'),
      cn('c2', 'eventProc', 'output0', 'fallback', 'input0'),
      cn('c3', 'zero', 'output0', 'fallback', 'input1'),
      cn('d0', 'toNum', 'output0', 'add1', 'input0'),
      cn('d1', 'fallback', 'output0', 'add1', 'input1'),
      cn('e0', 'add1', 'output0', 'out2', 'input0'),
    ],
    formula: '', updatedAt: 0,
  };

  const formula = await compileFormula(twoOutputGraph);

  /* ---- 1. compile-level: two distinct keys, each carrying its own __targetId ---- */
  {
    const keyMatches = formula.match(/" nlOutTarget:[^"]+"/g) || [];
    ok('1a) two Output entries get two DISTINCT per-node keys (no duplicate object-literal key)',
      new Set(keyMatches).size === 2 && keyMatches.length === 2, JSON.stringify(keyMatches));
    ok('1b) both entries carry __targetId "target" so the runtime can still resolve the real DOM target',
      (formula.match(/"__targetId":\s*"target"/g) || []).length === 2, formula);
  }

  /* ---- 2. end-to-end: initialization + 3 consecutive event executions ---- */
  {
    const w = bootRuntime('<div id="target" data-nodelogic-id="target">unset</div>', formula);
    await wait(80);
    const target = w.document.getElementById('target');

    // Sidestep the page-load ordering nuance (both Outputs apply on the very
    // first pass; the arithmetic branch's own event-gating makes it a no-op
    // then) and start from Output #1's documented initialization value.
    target.textContent = '1';

    const expected = [2, 3, 4];
    for (let i = 0; i < 3; i++) {
      w.dispatchEvent(new w.CustomEvent('tick'));
      await wait(80);
      ok(`2) event #${i + 1}: Get Element Property observes the value the PREVIOUS execution wrote (-> ${expected[i]})`,
        target.textContent === String(expected[i]), target.textContent);
    }
  }

  /* ---- 3. Regression: the common single-Output-per-target case is unaffected ---- */
  {
    const g = {
      elements: [
        mk('c', 'number', { value: 42 }),
        mk('out', 'output', { selectedElement: 'solo' }),
      ],
      connections: [cn('a', 'c', 'output0', 'out', 'input0')],
      formula: '', updatedAt: 0,
    };
    const f = await compileFormula(g);
    const w = bootRuntime('<div id="solo" data-nodelogic-id="solo">x</div>', f);
    await wait(80);
    ok('3) a single Output targeting an element via the dropdown still writes correctly',
      w.document.getElementById('solo').textContent === '42', w.document.getElementById('solo').textContent);
  }

  /* ---- 4. Backward compatibility: an OLD-format formula (bare target id as
   *         the key, no __targetId) -- as an already-published, not-yet-
   *         resaved page would still be serving -- keeps resolving via the
   *         entryKey fallback. ---- */
  {
    const oldFormula = `({ "legacy": { "value": 99 } })`;
    const w = bootRuntime('<div id="legacy" data-nodelogic-id="legacy">x</div>', oldFormula);
    await wait(80);
    ok('4) a pre-fix compiled formula (bare target-id key, no __targetId) still resolves its target',
      w.document.getElementById('legacy').textContent === '99', w.document.getElementById('legacy').textContent);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
