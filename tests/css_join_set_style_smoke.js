/* Regression for the reported bug: "combined color + display via CSS Join
 * into Set Style, and nothing happened."
 *
 * Root cause (two parts):
 *  1) css-color / css-display / css-width / etc. all emit a BARE value
 *     ("#bf61d0", "block") -- never "property: value" -- so joining two of
 *     them via CSS Join produced meaningless text like "#bf61d0; block"
 *     (no property names at all). CSS Join now takes an OPTIONAL property
 *     name per input slot (mirroring object-build's per-key inputs); a
 *     named slot is joined as "name: value", an unnamed slot stays a bare
 *     value exactly as before (backward compatible).
 *  2) Even with a real "color: X; display: Y" string, action-set-style's
 *     runtime unconditionally did `node.style[actionNode.property] = value`
 *     -- assigning an entire multi-declaration string to ONE property is
 *     invalid CSS and silently no-ops. setStyle's handler now detects real
 *     "name: value" segments in the incoming value and applies each via
 *     setProperty instead, falling back to the original single-property
 *     assignment when the value has no such segment (the common case: a
 *     bare color/keyword/gradient with no colon).
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
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 90000);

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

(async () => {
  await compile([mk('n', 'number', { value: 1 }), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' })], [cn('w', 'n', 'output0', 'o', 'input1')]);

  // ==================== CSS Color + CSS Display -> CSS Join (named slots) -> Set Style ====================
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('color', 'css-color', { colorValue: '#bf61d0' }),
      mk('display', 'css-display', { cssDisplay: 'block' }),
      mk('join', 'css-join', { inputCount: 2, cssJoinPropertyNames: ['color', 'display'] }),
      mk('setStyle', 'action-set-style', {}),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setStyle', 'input0'),
      cn('s2', 'color', 'output0', 'join', 'input0'),
      cn('s3', 'display', 'output0', 'join', 'input1'),
      cn('s4', 'join', 'output0', 'setStyle', 'input1'),
    ];
    const f = await compile(elements, connections);
    ok('CSS Join (named slots) + Set Style: compiles', !!f, f);
    ok('CSS Join: produces real "color: ...; display: ..." declarations, not bare-joined garbage', f.includes('"color: "') && f.includes('"display: "'), f);
    const { w, errs } = bootRuntime('<div id="target" style="display:none">Text</div>', f);
    await wait(120);
    ok('CSS Join + Set Style: no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    const style = w.document.getElementById('target').style;
    ok('CSS Join + Set Style: color applied', style.color === 'rgb(191, 97, 208)' || style.color === '#bf61d0', style.cssText);
    ok('CSS Join + Set Style: display applied too (both from one node)', style.display === 'block', style.cssText);
  }

  // ==================== Backward compat: unnamed CSS Join slots still just concatenate bare text ====================
  {
    const elements = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'target2' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('a', 'constant-string', { value: 'color: blue' }),
      mk('b', 'constant-string', { value: 'display: inline' }),
      mk('join', 'css-join', { inputCount: 2 }),
      mk('setStyle', 'action-set-style', {}),
    ];
    const connections = [
      cn('a0', 'elref', 'output0', 'out', 'input0'),
      cn('s1', 'out', 'output0', 'setStyle', 'input0'),
      cn('s2', 'a', 'output0', 'join', 'input0'),
      cn('s3', 'b', 'output0', 'join', 'input1'),
      cn('s4', 'join', 'output0', 'setStyle', 'input1'),
    ];
    const f = await compile(elements, connections);
    const { w, errs } = bootRuntime('<div id="target2">Text</div>', f);
    await wait(120);
    ok('CSS Join (unnamed slots, literal "prop: value" strings): no crash', noRuntimeError(errs), errs.join(';') + ' | ' + f);
    const style = w.document.getElementById('target2').style;
    ok('CSS Join (unnamed slots): both literal declarations still applied via the new multi-declaration parsing', style.color === 'blue' && style.display === 'inline', style.cssText);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
