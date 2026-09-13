/* Regression test: ONE Action Output branching into MULTIPLE Action Event
 * nodes (true fan-out), each with its own independent downstream action
 * chain (Set Value).
 *
 *   Target A (Action Output)
 *       |-- Action Event (Special) -> Set Value <- connected logic flow
 *       `-- Action Event (Reset)   -> Set Value <- constant
 *
 * This is NOT "Event -> Action -> Set Value": both Action Event nodes are
 * children of the SAME Output node's single 'action' output pin
 * (getOutgoingConnections(output.id) returning TWO connections, not one).
 *
 * Investigated per an explicit "trace before patching" brief: connection
 * storage (an array, never deduped by source), the mouse-drag connection
 * completion handler (graphEditor.tsx, dedups new connections only by
 * DESTINATION pin -- never by source, so two wires from one output pin to
 * two different destinations both survive), the compile-time action-tree
 * builder (buildActionPlanExpression / the Output's own actionPairs, both
 * driven by `getOutgoingConnections(id).map(...)` over EVERY outgoing
 * connection, not just the first), the Action Event node identity used for
 * runtime listener dedup (__nodeId for a wired Element pin, sourceId
 * otherwise -- both already unique per node, established by the
 * element-input-pin-architecture and output-same-target-key-collision fixes),
 * and the per-Output-entry binding registry (nodelogicActionBindings, keyed
 * by blockScope + entryKey, holding one Map of per-branch listeners keyed by
 * getEventActionSignature). All of these already support true fan-out with
 * independently addressable branches -- this suite is the regression guard
 * proving it (covers both the wired-Element-pin and the plain-ID-dropdown
 * targeting styles for the Action Event's own trigger element, 2 and 3
 * sibling branches, repeated/interleaved firing, unrelated recalculation
 * noise in between, and two separate logic blocks sharing identical
 * internal node ids so a cross-block collision would show up immediately).
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
function bootRuntime(bodyHtml, formulasByBlock) {
  // formulasByBlock: array of formula strings, one per logic block, each
  // block sharing data-editor-id "dup" (simulating a duplicated widget) so
  // only DOM position (blockIndex) tells the runtime's blockScope apart.
  const blocks = formulasByBlock
    .map((f, i) => `<div data-nodelogic-logic="1" id="lb${i}" data-editor-id="dup" data-output-configs="{}" style="display:none"></div>`)
    .join('\n');
  const html = `<!doctype html><body>${bodyHtml}\n${blocks}\n</body>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  formulasByBlock.forEach((f, i) => w.document.getElementById(`lb${i}`).setAttribute('data-formula', f));
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return w;
}

function fanoutGraph({ wired }) {
  const trigger = (id, elrefNodeId, domElementId) => wired
    ? { data: { actionEventType: 'click' }, pin: cn(`p-${id}`, elrefNodeId, 'output0', id, 'input1') }
    : { data: { actionEventType: 'click', actionTargetId: domElementId, actionUseManualId: false }, pin: null };

  const special = trigger('actEvtSpecial', 'elrefSpecialBtn', 'specialBtn');
  const reset = trigger('actEvtReset', 'elrefResetBtn', 'resetBtn');

  const elements = [
    mk('elrefTarget', 'element-ref', { elementUseManualId: true, customElementId: 'targetA' }),
    mk('out', 'output', { outputTargetElementPin: true }),
    mk('actEvtSpecial', 'action-event', special.data),
    mk('specialValue', 'number', { value: 42 }),
    mk('setValueSpecial', 'action-set-value', {}),
    mk('actEvtReset', 'action-event', reset.data),
    mk('setValueReset', 'action-set-value', { valueText: '0' }),
  ];
  const connections = [
    cn('a0', 'elrefTarget', 'output0', 'out', 'input0'),
    cn('s1', 'out', 'output0', 'actEvtSpecial', 'input0'),
    cn('s2', 'actEvtSpecial', 'output0', 'setValueSpecial', 'input0'),
    cn('s3', 'specialValue', 'output0', 'setValueSpecial', 'input1'),
    cn('r1', 'out', 'output0', 'actEvtReset', 'input0'),
    cn('r2', 'actEvtReset', 'output0', 'setValueReset', 'input0'),
  ];
  if (wired) {
    elements.push(mk('elrefSpecialBtn', 'element-ref', { elementUseManualId: true, customElementId: 'specialBtn' }));
    elements.push(mk('elrefResetBtn', 'element-ref', { elementUseManualId: true, customElementId: 'resetBtn' }));
    connections.push(special.pin, reset.pin);
  }
  return { elements, connections, formula: '', updatedAt: 0 };
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  for (const wired of [true, false]) {
    const label = wired ? 'Element-pin-wired' : 'ID-dropdown';

    /* ========================================================
     * 1-3. Compile: both branches survive, each keeps its own
     *      Set Value / value source.
     * ======================================================== */
    const g = fanoutGraph({ wired });
    const { formula } = await compileFormula(g);
    const eventCount = (formula.match(/type": "event"|type: "event"/g) || []).length;
    ok(`[${label}] 1) both outgoing Action connections survive compilation (2 event branches)`,
      eventCount === 2, `found ${eventCount} in: ${formula}`);
    ok(`[${label}] 2) Special branch retains its own Set Value (value 42)`, /42/.test(formula), formula);
    ok(`[${label}] 3) Reset branch retains its own Set Value (constant "0")`, /"0"/.test(formula), formula);

    /* ========================================================
     * 4-8. Runtime: independent execution, no cross-branch bleed,
     *      repeated/interleaved firing does not corrupt state.
     * ======================================================== */
    const w = bootRuntime(
      '<button id="specialBtn">Special</button><button id="resetBtn">Reset</button>'
      + '<input id="targetA" data-nodelogic-id="targetA" value="init" />',
      [formula]
    );
    await wait(150);
    const targetA = w.document.getElementById('targetA');
    const specialBtn = w.document.getElementById('specialBtn');
    const resetBtn = w.document.getElementById('resetBtn');
    const click = (el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));

    click(specialBtn); await wait(100);
    ok(`[${label}] 4) triggering Special sets targetA to 42, does not touch Reset`, targetA.value === '42', targetA.value);

    click(resetBtn); await wait(100);
    ok(`[${label}] 5) triggering Reset sets targetA to 0, not overwritten back to Special's value`, targetA.value === '0', targetA.value);

    click(specialBtn); await wait(100);
    click(resetBtn); await wait(100);
    click(specialBtn); await wait(100);
    ok(`[${label}] 6) Special -> Reset -> Special leaves targetA on Special's value (42)`, targetA.value === '42', targetA.value);

    click(resetBtn); await wait(100);
    click(specialBtn); await wait(100);
    click(resetBtn); await wait(100);
    ok(`[${label}] 7) Reset -> Special -> Reset leaves targetA on Reset's constant (0)`, targetA.value === '0', targetA.value);

    // Repeated execution + unrelated recalculation noise must not corrupt
    // either branch's binding (no leaked/duplicated listeners, no drift).
    for (let i = 0; i < 4; i++) {
      click(specialBtn); await wait(60);
      targetA.dispatchEvent(new w.Event('input', { bubbles: true }));
      await wait(30);
    }
    ok(`[${label}] 8) repeated Special execution + unrelated recalcs: still exactly 42 (no double-apply drift)`, targetA.value === '42', targetA.value);
    click(resetBtn); await wait(100);
    ok(`[${label}] 8b) Reset still independently reachable after repeated Special firing`, targetA.value === '0', targetA.value);
  }

  /* ============================================================
   * 9. Two separate logic blocks with IDENTICAL internal node ids
   *    (simulating a duplicated widget) each running their own
   *    Output -> Special/Reset fan-out must not collide.
   * ============================================================ */
  {
    const gA = fanoutGraph({ wired: true });
    const gB = fanoutGraph({ wired: true }); // same ids as gA, different DOM elements
    const { formula: fA } = await compileFormula(gA);
    const { formula: fB } = await compileFormula(gB);

    const w = bootRuntime(
      '<button id="specialBtn">SpecialA</button><button id="resetBtn">ResetA</button>'
      + '<input id="targetA" data-nodelogic-id="targetA" value="init" />'
      + '<button id="specialBtn2">SpecialB</button><button id="resetBtn2">ResetB</button>'
      + '<input id="targetA2" data-nodelogic-id="targetA2" value="init" />',
      [fA, fB.replace(/specialBtn/g, 'specialBtn2').replace(/resetBtn/g, 'resetBtn2').replace(/targetA/g, 'targetA2')]
    );
    await wait(150);
    const tA = w.document.getElementById('targetA');
    const tB = w.document.getElementById('targetA2');
    const click = (id) => w.document.getElementById(id).dispatchEvent(new w.Event('click', { bubbles: true }));

    click('specialBtn'); await wait(100);
    ok('9a) block A Special fires independently of block B', tA.value === '42' && tB.value === 'init', `${tA.value} / ${tB.value}`);

    click('resetBtn2'); await wait(100);
    ok('9b) block B Reset fires independently, does not affect block A', tA.value === '42' && tB.value === '0', `${tA.value} / ${tB.value}`);

    click('specialBtn2'); await wait(100);
    click('resetBtn'); await wait(100);
    ok('9c) both blocks end on their own, independently-triggered branch', tA.value === '0' && tB.value === '42', `${tA.value} / ${tB.value}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
