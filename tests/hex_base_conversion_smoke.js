/* Regression test for the Number -> Base ("hex") conversion bug: `number-to-base`
 * and `number-parse` had no case in the formula-generation switch, so the
 * compiler fell through to the `default:` branch, which returns whatever is
 * wired into the node's own input pin unchanged -- e.g. 255 stayed "255"
 * instead of becoming "ff". Real editor bundle -> Save -> real frontend.js eval. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = require('path').resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(require('path').join(ROOT, "dist", "build", "elementor.js"), 'utf8');
const FRONT = fs.readFileSync(require('path').join(ROOT, "frontend.js"), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';

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
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function gen(elements, connections) {
  const w = makeWindow();
  const fcalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(450);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  if (b) b.click();
  await wait(250);
  return fcalls[fcalls.length - 1];
}
function ev(formula) {
  const dom = new JSDOM(`<!doctype html><body><div id="sink">START</div>
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/' });
  dom.window.eval(CSSP);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { sink: dom.window.document.getElementById('sink').textContent, errs };
}
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 200000);

async function scenario(label, nodeType, nodeData, sources, check) {
  const els = [mk('n', nodeType, nodeData), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' })];
  const conns = [cn('wo', 'n', 'output0', 'o', 'input1')];
  sources.forEach((s, i) => { els.push(mk('s' + i, s.t, s.d)); conns.push(cn('w' + i, 's' + i, 'output0', 'n', s.in)); });
  const f = await gen(els, conns);
  const r = ev(f);
  const noErr = r.errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;
  ok(`${label}: no crash`, noErr, r.errs.join(';') + ' | ' + JSON.stringify(f));
  ok(`${label}: ${check.d}`, check.fn(r.sink), `sink=${JSON.stringify(r.sink)} formula=${JSON.stringify(f)}`);
}

(async () => {
  // number-to-base: literal 255 -> default radix 16 -> "ff" (was "255" pre-fix)
  await scenario('TO-BASE 255 default radix16', 'number-to-base', { parseRadix: 16 },
    [{ t: 'number', d: { value: 255 }, in: 'input0' }],
    { d: '255 -> hex "ff"', fn: (s) => s === 'ff' });

  // number-to-base: formula-generated value (calculation 200+55), not a literal
  // sitting on the node's own data -- exercises the connected-input path.
  await scenario('TO-BASE formula-generated 200+55 -> hex', 'number-to-base', { parseRadix: 16 },
    [{ t: 'calculation', d: { operation: '+', inputValues: [200, 55] }, in: 'input0' }],
    { d: '(200+55=255) -> hex "ff"', fn: (s) => s === 'ff' });

  await scenario('TO-BASE 255 radix2', 'number-to-base', { parseRadix: 2 },
    [{ t: 'number', d: { value: 255 }, in: 'input0' }],
    { d: '255 -> binary "11111111"', fn: (s) => s === '11111111' });

  await scenario('TO-BASE 255 radix8', 'number-to-base', { parseRadix: 8 },
    [{ t: 'number', d: { value: 255 }, in: 'input0' }],
    { d: '255 -> octal "377"', fn: (s) => s === '377' });

  await scenario('TO-BASE 15 radix16 minLength4', 'number-to-base', { parseRadix: 16, minLength: 4 },
    [{ t: 'number', d: { value: 15 }, in: 'input0' }],
    { d: '15 -> zero-padded hex "000f"', fn: (s) => s === '000f' });

  // number-parse: "ff" base16 -> 255 (was passthrough "ff" pre-fix)
  await scenario('PARSE ff radix16', 'number-parse', { parseRadix: 16 },
    [{ t: 'constant-string', d: { value: 'ff' }, in: 'input0' }],
    { d: '"ff" -> 255', fn: (s) => s === '255' });

  await scenario('PARSE 11111111 radix2', 'number-parse', { parseRadix: 2 },
    [{ t: 'constant-string', d: { value: '11111111' }, in: 'input0' }],
    { d: '"11111111" -> 255', fn: (s) => s === '255' });

  await scenario('PARSE default radix10', 'number-parse', { parseRadix: 10 },
    [{ t: 'constant-string', d: { value: '42' }, in: 'input0' }],
    { d: '"42" base10 -> 42', fn: (s) => s === '42' });

  await scenario('TO-BASE non-numeric input', 'number-to-base', { parseRadix: 16 },
    [{ t: 'constant-string', d: { value: 'not-a-number' }, in: 'input0' }],
    { d: 'non-numeric -> "0" (no crash, no passthrough of garbage)', fn: (s) => s === '0' });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
