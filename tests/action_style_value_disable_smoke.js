/* Regression suite for the Output-pin -> Action-System migration.
 *
 * Output's legacy Background/Color/Disabled/CSS direct pins are REMOVED
 * (their functionality now lives entirely in the Action System, reached via
 * Output's own "actions" fan-out -- its output0 pin, type 'action' -- which
 * one or more child action-tree nodes attach to). The Value pin is KEPT: it
 * is the primary mechanism the whole product uses for the common "compute a
 * value, display it" case with no event involved at all, not a rarely-used
 * legacy pin -- removing it broke 210 pre-existing tests, confirming it is
 * load-bearing, core behavior.
 *
 * Two wiring shapes both compile and run correctly:
 *   - DIRECT: Output -> Set X (no Action Event) -- applies whenever Output
 *     evaluates, i.e. on load and on every recalculation. This is the
 *     "on load" pattern.
 *   - EVENT-GATED: Output -> Action Event -> Set X -- only applies when the
 *     Action Event's own DOM event fires. Action Event used to REQUIRE its
 *     own trigger target (actionTargetId, or a wired Element pin)
 *     independent of Output's target -- omitting it silently compiled the
 *     ENTIRE Action Event (and everything wired under it) to `null`, no
 *     error, nothing applied ("Output(targets X) -> Action Event -> Set
 *     Style" did nothing if the Action Event's own target was left unset,
 *     which is easy to do since it reads as redundant -- X was already
 *     specified on the Output). Fixed: an untargeted Action Event now
 *     inherits the enclosing Output's own resolved target. Explicitly-set
 *     targets are unaffected and still take priority; every event-gated
 *     scenario below sets actionTargetId explicitly.
 *
 * ROOT CAUSE FIXED (the reported "CSS Color -> Set Style does nothing"
 * bug): action-set-style's (and action-set-attr's) property-name text field
 * shared the SAME input row as its value pin. Once a value was wired,
 * `if (valuePinNode && index > 0 && valuePinConnected) return null;`
 * (graphEditor.tsx) hid that entire row -- including the property-name
 * field -- so `actionStyleProperty` could never be typed once wired, and
 * stayed the empty string forever. frontend.js's setStyle handler silently
 * no-ops on an empty property (by design, matching setAttribute's same
 * guard) -- no crash, just nothing happens. Fixed by moving the property/
 * attribute-name field to the row's index-0 slot (the 'action' attach-to-
 * parent pin, never gated by valuePinConnected), mirroring the pattern
 * action-set-visibility's mode selector already used correctly.
 *
 * ALSO FIXED: action-set-value always called setControlValue(node, ...),
 * which is a silent no-op DOM-expando write for a plain label-type element
 * (a <div>/<span>, no input/select/textarea) -- it never fell back to
 * `.textContent` the way the legacy Output "Value" pin's own application
 * code already did. Now matches that exact isLabelEl-style behavior.
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
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

function makeEditorWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
async function compileFormula(elements, connections) {
  const w = makeEditorWindow();
  const fcalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(550);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  if (b) b.click();
  await wait(350);
  return fcalls[fcalls.length - 1];
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

(async () => {
  // ===================== Set Value =====================
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setVal', 'action-set-value', {}),
      mk('num', 'number', { value: 42 }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setVal', 'input0'),
      cn('s2', 'num', 'output0', 'setVal', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Old</div>', f);
    await wait(100);
    ok('Set Value: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Set Value: connected/dynamic value applies on load (42)', w.document.getElementById('target').textContent === '42', w.document.getElementById('target').textContent);
  }
  {
    // static literal value, no upstream node at all
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setVal', 'action-set-value', { valueText: 'Hello World' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setVal', 'input0'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Old</div>', f);
    await wait(100);
    ok('Set Value: no crash (static literal)', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Set Value: static literal on a label element (<div>) uses textContent, not a no-op setControlValue', w.document.getElementById('target').textContent === 'Hello World', w.document.getElementById('target').textContent);
  }
  {
    // parity check on a real form control too (must still work as before)
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setVal', 'action-set-value', { valueText: 'typed' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setVal', 'input0'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<input id="target" value="Old">', f);
    await wait(100);
    ok('Set Value: still works on a real form control (no regression)', w.document.getElementById('target').value === 'typed', w.document.getElementById('target').value);
  }

  // ===================== Set Color (action-set-style, property=color) =====================
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('colorVal', 'constant-string', { value: 'blue' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setColor', 'input0'),
      cn('s2', 'colorVal', 'output0', 'setColor', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
    await wait(100);
    ok('Set Color: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Set Color: on-load, static color -> target.style.color === "blue" (the exact reported repro)', w.document.getElementById('target').style.color === 'blue', w.document.getElementById('target').style.color);
  }
  {
    // connected/dynamic color (built from two string parts via multi-concat,
    // not just a passthrough constant) + event-triggered (Action Event -> Set Color)
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('actEvt', 'action-event', { actionEventType: 'click', actionTargetId: 'target', actionUseManualId: false }),
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('concat', 'multi-concat', { inputCount: 2 }),
      mk('part1', 'constant-string', { value: 'gr' }),
      mk('part2', 'constant-string', { value: 'een' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'actEvt', 'input0'),
      cn('s2', 'actEvt', 'output0', 'setColor', 'input0'),
      cn('c0', 'part1', 'output0', 'concat', 'input0'),
      cn('c1', 'part2', 'output0', 'concat', 'input1'),
      cn('s3', 'concat', 'output0', 'setColor', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
    await wait(100);
    ok('Set Color: no crash (connected + event-triggered)', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Set Color: unclicked, no color applied yet (event-gated)', w.document.getElementById('target').style.color === '', w.document.getElementById('target').style.color);
    w.document.getElementById('target').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(120);
    ok('Set Color: after click, connected/dynamic color (concatenated at runtime) applied -> "green"', w.document.getElementById('target').style.color === 'green', w.document.getElementById('target').style.color);
  }
  {
    // multiple independent targets
    const elements = [
      mk('elref1', 'element-ref', { elementUseManualId: true, customElementId: 't1' }),
      mk('out1', 'output', { outputTargetElementPin: true }),
      mk('setColor1', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('c1', 'constant-string', { value: 'blue' }),
      mk('elref2', 'element-ref', { elementUseManualId: true, customElementId: 't2' }),
      mk('out2', 'output', { outputTargetElementPin: true }),
      mk('setColor2', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('c2', 'constant-string', { value: 'orange' }),
    ];
    const connections = [
      cn('a1', 'elref1', 'output0', 'out1', 'input0'),
      cn('s1', 'out1', 'output0', 'setColor1', 'input0'),
      cn('s1v', 'c1', 'output0', 'setColor1', 'input1'),
      cn('a2', 'elref2', 'output0', 'out2', 'input0'),
      cn('s2', 'out2', 'output0', 'setColor2', 'input0'),
      cn('s2v', 'c2', 'output0', 'setColor2', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="t1">A</div><div id="t2">B</div>', f);
    await wait(100);
    ok('Set Color: no crash (multiple independent targets)', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Set Color: target 1 gets its own color (blue)', w.document.getElementById('t1').style.color === 'blue', w.document.getElementById('t1').style.color);
    ok('Set Color: target 2 gets its own, different color (orange)', w.document.getElementById('t2').style.color === 'orange', w.document.getElementById('t2').style.color);
  }

  // ===================== Set Background (action-set-style, property=background/background-color) =====================
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setBg', 'action-set-style', { actionStyleProperty: 'background-color' }),
      mk('bgVal', 'constant-string', { value: 'red' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setBg', 'input0'),
      cn('s2', 'bgVal', 'output0', 'setBg', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
    await wait(100);
    ok('Set Background: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Set Background: on-load, static background-color -> "red"', w.document.getElementById('target').style.backgroundColor === 'red', w.document.getElementById('target').style.backgroundColor);
  }
  {
    // "background" (shorthand) property + connected value, event-triggered
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('actEvt', 'action-event', { actionEventType: 'click', actionTargetId: 'target', actionUseManualId: false }),
      mk('setBg', 'action-set-style', { actionStyleProperty: 'background' }),
      mk('bgVal', 'constant-string', { value: 'linear-gradient(red, blue)' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'actEvt', 'input0'),
      cn('s2', 'actEvt', 'output0', 'setBg', 'input0'),
      cn('s3', 'bgVal', 'output0', 'setBg', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
    await wait(100);
    ok('Set Background (shorthand, gradient, event-triggered): no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    w.document.getElementById('target').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(120);
    ok('Set Background: connected CSS gradient value applied after click', w.document.getElementById('target').style.background.includes('gradient'), w.document.getElementById('target').style.background);
  }

  // ===================== Set Style: generic property coverage =====================
  {
    const props = [
      { property: 'color', value: 'blue', check: (s) => s.color === 'blue' },
      { property: 'background', value: 'red', check: (s) => s.background === 'red' },
      { property: 'background-color', value: 'yellow', check: (s) => s.backgroundColor === 'yellow' },
      { property: 'display', value: 'none', check: (s) => s.display === 'none' },
    ];
    for (const { property, value, check } of props) {
      const elements = [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
        mk('out', 'output', { outputTargetElementPin: true }),
        mk('setStyle', 'action-set-style', { actionStyleProperty: property }),
        mk('val', 'constant-string', { value }),
      ];
      const connections = [
        cn('a0', 'elref', 'output0', 'out', 'input0'),
        cn('s1', 'out', 'output0', 'setStyle', 'input0'),
        cn('s2', 'val', 'output0', 'setStyle', 'input1'),
      ];
      const f = await compileFormula(elements, connections);
      const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
      await wait(100);
      ok(`Set Style [${property}]: no crash`, noRuntimeError(errs), errs.join(';') + ' | ' + f);
      ok(`Set Style [${property}]: connected value actually applied (${value})`, check(w.document.getElementById('target').style), JSON.stringify(w.document.getElementById('target').style.cssText));
    }
  }

  // ===================== Set Style through an Elementor widget wrapper =====================
  // Reported bug: "CSS Style (text color) does not visually change the
  // element." The JS mechanism itself was already sound (every scenario
  // above passes) -- the real gap was WHICH element it applied to. Elementor
  // renders every widget as
  //   <div id="X" class="elementor-element"><div class="elementor-widget-container"><h2 class="elementor-heading-title">Text</h2></div></div>
  // Targeting "X" resolved to the OUTER structural div; setting .style.color
  // there is masked by the inner <h2>'s own explicit color (Elementor's
  // generated per-widget CSS), so nothing visibly changed. Fixed by having
  // resolveActionTargetElement descend through the lone-child wrapper chain
  // to the real content element (nlDescendSingleChildContent), same as it
  // already did for form controls.
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('val', 'constant-string', { value: 'blue' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setColor', 'input0'),
      cn('s2', 'val', 'output0', 'setColor', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime(
      '<div id="target" class="elementor-element"><div class="elementor-widget-container"><h2 class="elementor-heading-title">Text</h2></div></div>',
      f,
    );
    await wait(100);
    ok('Set Style through Elementor wrapper: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    const heading = w.document.querySelector('.elementor-heading-title');
    ok('Set Style through Elementor wrapper: the REAL text element gets the color', heading.style.color === 'blue', heading.style.cssText);
  }

  // ===================== Disable / Enable =====================
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('disableIt', 'action-disable', {}),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'disableIt', 'input0'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<button id="target">Click</button>', f);
    await wait(100);
    ok('Disable: no crash (on load)', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Disable: on-load, target.disabled === true (real DOM property, not a CSS class)', w.document.getElementById('target').disabled === true, w.document.getElementById('target').disabled);
    ok('Disable: real "disabled" attribute is also set', w.document.getElementById('target').hasAttribute('disabled'), w.document.getElementById('target').outerHTML);
  }
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('enableIt', 'action-enable', {}),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'enableIt', 'input0'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<button id="target" disabled>Click</button>', f);
    await wait(100);
    ok('Enable: no crash (re-enable on load)', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Enable: re-enables a previously-disabled control (target.disabled === false)', w.document.getElementById('target').disabled === false, w.document.getElementById('target').disabled);
  }
  {
    // event-triggered disable
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('actEvt', 'action-event', { actionEventType: 'click', actionTargetId: 'trigger', actionUseManualId: false }),
      mk('disableIt', 'action-disable', {}),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'actEvt', 'input0'),
      cn('s2', 'actEvt', 'output0', 'disableIt', 'input0'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<button id="target">Click</button><button id="trigger">Trigger</button>', f);
    await wait(100);
    ok('Disable (event-triggered): no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Disable (event-triggered): not disabled before the trigger event', w.document.getElementById('target').disabled === false, w.document.getElementById('target').disabled);
    w.document.getElementById('trigger').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(120);
    ok('Disable (event-triggered): disabled after the trigger event fires', w.document.getElementById('target').disabled === true, w.document.getElementById('target').disabled);
  }

  // ===================== Action fan-out: ONE Output -> 5 independent action types =====================
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      // Direct (on-load) actions:
      mk('setVal', 'action-set-value', { valueText: 'Fan-out OK' }),
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('colorVal', 'constant-string', { value: 'blue' }),
      mk('setBg', 'action-set-style', { actionStyleProperty: 'background-color' }),
      mk('bgVal', 'constant-string', { value: 'yellow' }),
      // Event-gated action (still fans out from the SAME Output, alongside the direct ones):
      mk('actEvt', 'action-event', { actionEventType: 'click', actionTargetId: 'target', actionUseManualId: false }),
      mk('disableIt', 'action-disable', {}),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setVal', 'input0'),
      cn('s2', 'out', 'output0', 'setColor', 'input0'),
      cn('s2v', 'colorVal', 'output0', 'setColor', 'input1'),
      cn('s3', 'out', 'output0', 'setBg', 'input0'),
      cn('s3v', 'bgVal', 'output0', 'setBg', 'input1'),
      cn('s4', 'out', 'output0', 'actEvt', 'input0'),
      cn('s5', 'actEvt', 'output0', 'disableIt', 'input0'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<button id="target">Old</button>', f);
    await wait(100);
    ok('Fan-out (5 actions from 1 Output): no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    const target = w.document.getElementById('target');
    ok('Fan-out: Set Value applied on load', target.textContent === 'Fan-out OK', target.textContent);
    ok('Fan-out: Set Color applied on load (independently of Set Value)', target.style.color === 'blue', target.style.color);
    ok('Fan-out: Set Background applied on load (independently of the other two)', target.style.backgroundColor === 'yellow', target.style.backgroundColor);
    ok('Fan-out: Disable NOT yet applied (event-gated, no click yet)', target.disabled === false, target.disabled);
    target.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(120);
    ok('Fan-out: Disable applies after click, WITHOUT disturbing the other 3 direct actions\' effects', target.disabled === true && target.textContent === 'Fan-out OK' && target.style.color === 'blue' && target.style.backgroundColor === 'yellow',
      `disabled=${target.disabled} text=${target.textContent} color=${target.style.color} bg=${target.style.backgroundColor}`);
  }

  // ===================== Action Event target inheritance =====================
  {
    // Action Event has NO target of its own (no actionTargetId, no wired
    // Element pin) -- must inherit the enclosing Output's own target
    // instead of silently compiling to null. This is the exact real-world
    // shape a user builds without realizing the Action Event needs its own
    // (redundant-looking) target.
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('actEvt', 'action-event', { actionEventType: 'click' }), // no target set at all
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('colorVal', 'constant-string', { value: 'purple' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'actEvt', 'input0'),
      cn('s2', 'actEvt', 'output0', 'setColor', 'input0'),
      cn('s3', 'colorVal', 'output0', 'setColor', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    ok('Action Event target inheritance: compiles to a non-empty formula (not silently dropped)', typeof f === 'string' && f.length > 0, f);
    const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
    await wait(100);
    ok('Action Event target inheritance: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('Action Event target inheritance: click on the INHERITED target (same as Output\'s) fires the action', (() => {
      w.document.getElementById('target').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      return true;
    })(), '');
    await wait(120);
    ok('Action Event target inheritance: Set Color applied after inheriting Output\'s target', w.document.getElementById('target').style.color === 'purple', w.document.getElementById('target').style.color);
  }
  {
    // An EXPLICIT Action Event target must still win over inheritance.
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'outputTarget' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('actEvt', 'action-event', { actionEventType: 'click', actionTargetId: 'trigger', actionUseManualId: false }),
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('colorVal', 'constant-string', { value: 'teal' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'actEvt', 'input0'),
      cn('s2', 'actEvt', 'output0', 'setColor', 'input0'),
      cn('s3', 'colorVal', 'output0', 'setColor', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="outputTarget">Out</div><button id="trigger">Trigger</button>', f);
    await wait(100);
    ok('Action Event explicit target still wins: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    w.document.getElementById('trigger').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    await wait(120);
    ok('Action Event explicit target still wins: Set Color applies to the EXPLICIT target ("outputTarget"), not just because it inherited', w.document.getElementById('outputTarget').style.color === 'teal', w.document.getElementById('outputTarget').style.color);
  }

  // ===================== css-color ("CSS Color") standalone literal value =====================
  {
    // Root cause of the reported "CSS Color after connecting to Set Style
    // is not working": css-color previously had NO canvas control at all
    // and purely relayed a wired input, defaulting to "" when nothing was
    // wired -- so it silently produced an empty value despite the palette
    // naming it a color picker ("CSS Color"). Now it has its own literal
    // colorValue, used whenever nothing is wired into it.
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('cssColor', 'css-color', { colorValue: '#0000ff' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setColor', 'input0'),
      cn('s2', 'cssColor', 'output0', 'setColor', 'input1'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
    await wait(100);
    ok('CSS Color (standalone, unwired): no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('CSS Color (standalone, unwired): its own literal value is used, applied on load via Set Style', w.document.getElementById('target').style.color === 'rgb(0, 0, 255)', w.document.getElementById('target').style.color);
  }
  {
    // Backward compatibility: an existing graph relaying a WIRED value
    // through css-color must keep working exactly as before.
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('setColor', 'action-set-style', { actionStyleProperty: 'color' }),
      mk('cssColor', 'css-color', { colorValue: '#0000ff' }), // literal present but must be ignored -- input0 is wired
      mk('upstream', 'constant-string', { value: 'orange' }),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setColor', 'input0'),
      cn('s2', 'cssColor', 'output0', 'setColor', 'input1'),
      cn('w0', 'upstream', 'output0', 'cssColor', 'input0'),
    ];
    const f = await compileFormula(elements, connections);
    const { w, errs } = bootRuntime('<div id="target">Text</div>', f);
    await wait(100);
    ok('CSS Color (wired relay, backward compat): no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    ok('CSS Color (wired relay, backward compat): the WIRED value wins over the literal fallback', w.document.getElementById('target').style.color === 'orange', w.document.getElementById('target').style.color);
  }

  // ===================== Legacy Output pins removed =====================
  {
    const w = makeEditorWindow();
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e',
      graphState: { elements: [mk('out', 'output', { selectedElement: '' })], connections: [], formula: '', updatedAt: 0 },
      onStateChange: () => {}, onFormulaChange: () => {},
    });
    await wait(550);
    const outEl = w.document.querySelector('[data-element-id="out"]');
    const pinCount = outEl.querySelectorAll('.pin.input').length;
    ok('Legacy pins removed: Output now exposes exactly 2 input pins (Element + Value)', pinCount === 2, `pinCount=${pinCount}`);
    const bodyText = outEl.textContent;
    ok('Legacy pins removed: no "Background" pin label rendered', !/Background/.test(bodyText), bodyText);
    ok('Legacy pins removed: no "Disabled" pin label rendered', !/Disabled/.test(bodyText), bodyText);
    ok('Legacy pins removed: no "CSS" pin label rendered', !/\bCSS\b/.test(bodyText), bodyText);
  }
  {
    // Legacy saved graph: a connection wired to input2 (the old Background
    // pin) must not crash the editor -- it should be treated as stale and
    // simply not compiled, and the migration should prune it rather than
    // leave a dangling wire pointing past the now-shorter card.
    const legacyGraph = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
        mk('out', 'output', { outputTargetElementPin: true }),
        mk('num', 'number', { value: 7 }),
        mk('bgSrc', 'constant-string', { value: 'red' }),
      ],
      connections: [
        cn('a0', 'elref', 'output0', 'out', 'input0'),
        cn('v1', 'num', 'output0', 'out', 'input1'), // Value pin -- must still work
        cn('v2', 'bgSrc', 'output0', 'out', 'input2'), // legacy Background pin -- must be pruned safely
      ],
      formula: '', updatedAt: 0,
    };
    const w = makeEditorWindow();
    const errs = [];
    w.addEventListener('error', (e) => errs.push(String(e.error && e.error.stack || e.message)));
    const fcalls = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: legacyGraph, onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
    });
    await wait(550);
    ok('Legacy graph with a stale Background-pin connection: no editor crash', errs.length === 0, errs.join(';'));
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(350);
    const f = fcalls[fcalls.length - 1];
    ok('Legacy graph: Value pin (input1) still compiles correctly despite the stale sibling connection', typeof f === 'string' && f.includes('7'), f);
    const { w: rw, errs: rerrs } = bootRuntime('<div id="target">Old</div>', f);
    await wait(100);
    ok('Legacy graph: no runtime error evaluating the migrated formula', noRuntimeError(rerrs), rerrs.join(';') + ' | ' + f);
    ok('Legacy graph: Value still applies (7)', rw.document.getElementById('target').textContent === '7', rw.document.getElementById('target').textContent);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
