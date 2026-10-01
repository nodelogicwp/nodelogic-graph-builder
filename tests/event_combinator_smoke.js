/* Regression for the new Event OR / Event AND combinator nodes and their
 * matching Action ("Event Trigger Action", type action-event-gate).
 *
 *  - event-or:  fires whenever EITHER wired input event's triggeredCount
 *    increases since this node last observed it.
 *  - event-and: fires only when BOTH wired input events occur within a
 *    configurable time window of each other; a lone firing outside that
 *    window is dropped, not carried forward indefinitely.
 *  - action-event-gate: an Action-System node (lives in the same tree as
 *    Set Text / Set Style / ...) whose OWN trigger is a wired Event VALUE
 *    (a plain event, or an event-or/event-and combinator's output) instead
 *    of action-event's DOM eventType + target. Its nested actions apply
 *    exactly once per genuinely new firing (nlConsumeEventOnce), same
 *    idempotency guarantee Send Email's own Trigger pin already relies on.
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
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 120000);

function makeEditorWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
async function compile(elements, connections) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const w = makeEditorWindow();
    const fcalls = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
      onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
    });
    await wait(attempt === 0 ? 550 : 1300);
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(attempt === 0 ? 350 : 800);
    const f = fcalls[fcalls.length - 1];
    if (f) return f;
  }
  return '';
}
function bootRuntime(bodyHtml, formula) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(w.performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  w.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; w.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, errs };
}
const noRuntimeError = (errs) => errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;
const click = (w, id) => w.document.getElementById(id).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  await compile([mk('n', 'number', { value: 1 }), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' })], [cn('w', 'n', 'output0', 'o', 'input1')]);

  // ==================== Event OR -> action-event-gate ====================
  {
    const elements = [
      mk('elrefA', 'element-ref', { elementUseManualId: true, customElementId: 'btnA' }),
      mk('elrefB', 'element-ref', { elementUseManualId: true, customElementId: 'btnB' }),
      mk('evA', 'event-element', { eventUseManualId: true, eventId: 'btnA' }),
      mk('evB', 'event-element', { eventUseManualId: true, eventId: 'btnB' }),
      mk('orNode', 'event-or', {}),
      mk('elrefSink', 'element-ref', { elementUseManualId: true, customElementId: 'sink1' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('gate', 'action-event-gate', {}),
      mk('setText', 'action-set-text', { valueText: 'FIRED' }),
    ];
    const connections = [
      cn('c1', 'evA', 'output0', 'orNode', 'input0'),
      cn('c2', 'evB', 'output0', 'orNode', 'input1'),
      cn('c3', 'elrefSink', 'output0', 'out', 'input0'),
      cn('c4', 'out', 'output0', 'gate', 'input0'),
      cn('c5', 'orNode', 'output0', 'gate', 'input1'),
      cn('c6', 'gate', 'output0', 'setText', 'input0'),
    ];
    const f = await compile(elements, connections);
    ok('Event OR + action-event-gate: compiles', !!f, f);
    ok('Event OR + action-event-gate: uses __nodeEventOr and eventGate', f.includes('__nodeEventOr(') && f.includes('"eventGate"'), f);

    const { w, errs } = bootRuntime('<button id="btnA">A</button><button id="btnB">B</button><div id="sink1">-</div>', f);
    await wait(120);
    ok('Event OR: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Event OR: unclicked, gate has not fired yet', w.document.getElementById('sink1').textContent === '-', w.document.getElementById('sink1').textContent);

    click(w, 'btnA');
    await wait(120);
    ok('Event OR: clicking A alone fires the gate (OR semantics)', w.document.getElementById('sink1').textContent === 'FIRED', w.document.getElementById('sink1').textContent);

    // Reset the sink and click B -- OR must fire again from the OTHER side too.
    w.document.getElementById('sink1').textContent = '-';
    click(w, 'btnB');
    await wait(120);
    ok('Event OR: clicking B also fires the gate', w.document.getElementById('sink1').textContent === 'FIRED', w.document.getElementById('sink1').textContent);
  }

  // ==================== Event AND: within window fires, outside does not ====================
  {
    const elements = [
      mk('evA', 'event-element', { eventUseManualId: true, eventId: 'btnA' }),
      mk('evB', 'event-element', { eventUseManualId: true, eventId: 'btnB' }),
      mk('andNode', 'event-and', { eventAndWindowMs: 200 }),
      mk('elrefSink', 'element-ref', { elementUseManualId: true, customElementId: 'sink1' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('gate', 'action-event-gate', {}),
      mk('setText', 'action-set-text', { valueText: 'BOTH-FIRED' }),
    ];
    const connections = [
      cn('c1', 'evA', 'output0', 'andNode', 'input0'),
      cn('c2', 'evB', 'output0', 'andNode', 'input1'),
      cn('c3', 'elrefSink', 'output0', 'out', 'input0'),
      cn('c4', 'out', 'output0', 'gate', 'input0'),
      cn('c5', 'andNode', 'output0', 'gate', 'input1'),
      cn('c6', 'gate', 'output0', 'setText', 'input0'),
    ];
    const f = await compile(elements, connections);
    ok('Event AND + action-event-gate: compiles', !!f, f);
    ok('Event AND: uses __nodeEventAnd with the configured 200ms window', f.includes('__nodeEventAnd(') && f.includes(', 200)'), f);

    // ---- Case 1: A then B WITHIN the window -> fires ----
    {
      const { w, errs } = bootRuntime('<button id="btnA">A</button><button id="btnB">B</button><div id="sink1">-</div>', f);
      await wait(120);
      ok('Event AND (in-window): no crash', noRuntimeError(errs), errs.join(';'));
      click(w, 'btnA');
      await wait(60);
      ok('Event AND (in-window): A alone does not fire yet', w.document.getElementById('sink1').textContent === '-', w.document.getElementById('sink1').textContent);
      click(w, 'btnB');
      await wait(120);
      ok('Event AND (in-window): B within the window fires the gate', w.document.getElementById('sink1').textContent === 'BOTH-FIRED', w.document.getElementById('sink1').textContent);
    }

    // ---- Case 2: A then B AFTER the window elapses -> does not fire ----
    {
      const { w, errs } = bootRuntime('<button id="btnA">A</button><button id="btnB">B</button><div id="sink1">-</div>', f);
      await wait(120);
      click(w, 'btnA');
      await wait(350); // window is 200ms -- let it fully expire
      click(w, 'btnB');
      await wait(120);
      ok('Event AND (out-of-window): B firing after the window elapsed does NOT fire the gate', w.document.getElementById('sink1').textContent === '-', w.document.getElementById('sink1').textContent);
      ok('Event AND (out-of-window): no crash', noRuntimeError(errs), errs.join(';'));
    }
  }

  // ==================== action-event-gate: fires exactly once per firing, no double-apply ====================
  {
    const elements = [
      mk('evA', 'event-element', { eventUseManualId: true, eventId: 'btnA' }),
      mk('elrefSink', 'element-ref', { elementUseManualId: true, customElementId: 'sink1' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('gate', 'action-event-gate', {}),
      mk('num', 'number', { value: 1 }),
      mk('setVal', 'action-set-value', {}),
    ];
    const connections = [
      cn('c1', 'elrefSink', 'output0', 'out', 'input0'),
      cn('c2', 'out', 'output0', 'gate', 'input0'),
      cn('c3', 'evA', 'output0', 'gate', 'input1'),
      cn('c4', 'gate', 'output0', 'setVal', 'input0'),
      cn('c5', 'num', 'output0', 'setVal', 'input1'),
    ];
    const f = await compile(elements, connections);
    const { w, errs } = bootRuntime('<button id="btnA">A</button><div id="sink1">0</div>', f);
    await wait(120);
    ok('action-event-gate (idempotency): no crash', noRuntimeError(errs), errs.join(';'));
    click(w, 'btnA');
    await wait(120);
    ok('action-event-gate (idempotency): fires on the real click', w.document.getElementById('sink1').textContent === '1', w.document.getElementById('sink1').textContent);
    // Force extra recalculation passes with NO new click -- must not re-apply.
    w.document.getElementById('sink1').textContent = 'untouched';
    w.dispatchEvent(new w.Event('resize'));
    await wait(150);
    ok('action-event-gate (idempotency): a later unrelated recalculation does not re-fire', w.document.getElementById('sink1').textContent === 'untouched', w.document.getElementById('sink1').textContent);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
