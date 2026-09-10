/* Verify the newly-wired boolean-logic / math / string nodes actually transform
 * (previously silent input0 pass-through). Real editor bundle -> Save -> real
 * frontend.js evaluation. String inputs use constant-string nodes. */
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

// n(type,data, [ [srcId,srcType,srcData,toInput], ... ] )
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
  await scenario('NOT true', 'not', {}, [{ t: 'constant-boolean', d: { value: true }, in: 'input0' }], { d: '!true = false', fn: (s) => s === 'false' });
  await scenario('NOT false', 'not', {}, [{ t: 'constant-boolean', d: { value: false }, in: 'input0' }], { d: '!false = true', fn: (s) => s === 'true' });
  await scenario('AND t,t', 'and', {}, [{ t: 'constant-boolean', d: { value: true }, in: 'input0' }, { t: 'constant-boolean', d: { value: true }, in: 'input1' }], { d: 'true && true = true', fn: (s) => s === 'true' });
  await scenario('AND t,f', 'and', {}, [{ t: 'constant-boolean', d: { value: true }, in: 'input0' }, { t: 'constant-boolean', d: { value: false }, in: 'input1' }], { d: 'true && false = false', fn: (s) => s === 'false' });
  await scenario('OR f,t', 'or', {}, [{ t: 'constant-boolean', d: { value: false }, in: 'input0' }, { t: 'constant-boolean', d: { value: true }, in: 'input1' }], { d: 'false || true = true', fn: (s) => s === 'true' });
  await scenario('OR f,f', 'or', {}, [{ t: 'constant-boolean', d: { value: false }, in: 'input0' }, { t: 'constant-boolean', d: { value: false }, in: 'input1' }], { d: 'false || false = false', fn: (s) => s === 'false' });
  await scenario('CLAMP 15 -> [0,10]', 'clamp', {}, [
    { t: 'number', d: { value: 15 }, in: 'input0' }, { t: 'number', d: { value: 0 }, in: 'input1' }, { t: 'number', d: { value: 10 }, in: 'input2' },
  ], { d: 'clamp(15,0,10) = 10', fn: (s) => s === '10' });
  await scenario('CLAMP -5 -> [0,10]', 'clamp', {}, [
    { t: 'number', d: { value: -5 }, in: 'input0' }, { t: 'number', d: { value: 0 }, in: 'input1' }, { t: 'number', d: { value: 10 }, in: 'input2' },
  ], { d: 'clamp(-5,0,10) = 0', fn: (s) => s === '0' });
  await scenario('CLAMP 7 -> [0,10]', 'clamp', {}, [
    { t: 'number', d: { value: 7 }, in: 'input0' }, { t: 'number', d: { value: 0 }, in: 'input1' }, { t: 'number', d: { value: 10 }, in: 'input2' },
  ], { d: 'clamp(7,0,10) = 7', fn: (s) => s === '7' });
  await scenario('MIN 3,8', 'min-val', {}, [{ t: 'number', d: { value: 3 }, in: 'input0' }, { t: 'number', d: { value: 8 }, in: 'input1' }], { d: 'min(3,8)=3', fn: (s) => s === '3' });
  await scenario('MAX 3,8', 'max-val', {}, [{ t: 'number', d: { value: 3 }, in: 'input0' }, { t: 'number', d: { value: 8 }, in: 'input1' }], { d: 'max(3,8)=8', fn: (s) => s === '8' });
  await scenario('INCLUDES yes', 'string-includes', {}, [{ t: 'constant-string', d: { value: 'hello world' }, in: 'input0' }, { t: 'constant-string', d: { value: 'world' }, in: 'input1' }], { d: '"hello world".includes("world") = true', fn: (s) => s === 'true' });
  await scenario('INCLUDES no', 'string-includes', {}, [{ t: 'constant-string', d: { value: 'hello' }, in: 'input0' }, { t: 'constant-string', d: { value: 'zzz' }, in: 'input1' }], { d: 'not included = false', fn: (s) => s === 'false' });
  await scenario('COUNT CHARS', 'string-count-chars', {}, [{ t: 'constant-string', d: { value: 'abcde' }, in: 'input0' }], { d: '"abcde".length = 5', fn: (s) => s === '5' });
  await scenario('COUNT CHARS empty (unwired)', 'string-count-chars', {}, [], { d: 'no input -> "".length = 0', fn: (s) => s === '0' });
  await scenario('NOT unwired', 'not', {}, [], { d: '!(false fallback) = true', fn: (s) => s === 'true' });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
