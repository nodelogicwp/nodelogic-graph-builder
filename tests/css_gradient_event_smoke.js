/* Release-gate: the CSS folder / gradient / event-processor nodes were
 * exposed in the palette but generated silent input0 pass-throughs (formula-gen
 * cases lost in a generator rewrite; runtime helpers still present). Now
 * restored. Real editor bundle -> Save -> real frontend.js evaluation. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const FRONT = fs.readFileSync(path.join(ROOT, 'frontend.js'), 'utf8');
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
const srcNode = (id, v) => (typeof v === 'string' ? mk(id, 'constant-string', { value: v }) : mk(id, 'number', { value: v }));

async function scenario(label, nodeType, nodeData, sources, check) {
  const els = [mk('n', nodeType, nodeData), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' })];
  const conns = [cn('wo', 'n', 'output0', 'o', 'input1')];
  sources.forEach((s, i) => { els.push(srcNode('s' + i, s.v)); conns.push(cn('w' + i, 's' + i, 'output0', 'n', s.in)); });
  const f = await gen(els, conns);
  const r = ev(f);
  const noErr = (r.errs || []).filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;
  ok(`${label}: no crash & safe formula`, noErr && typeof f === 'string' && f !== '', (r.errs || []).join(';') + ' | ' + JSON.stringify(f));
  ok(`${label}: ${check.d}`, check.fn(r.sink, f), `sink=${JSON.stringify(r.sink)} formula=${JSON.stringify(f)}`);
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 200000);

(async () => {
  // css-unit: number + unit -> "<n><unit>"
  await scenario('css-unit(px)', 'css-unit', { cssUnit: 'px' }, [{ v: 12, in: 'input0' }],
    { d: '12 + "px" = "12px"', fn: (s) => s === '12px' });
  await scenario('css-unit(%)', 'css-unit', { cssUnit: '%' }, [{ v: 50, in: 'input0' }],
    { d: '50%', fn: (s) => s === '50%' });

  // css-display / css-text: literal from data
  await scenario('css-display', 'css-display', { cssDisplay: 'flex' }, [],
    { d: 'emits "flex"', fn: (s) => s === 'flex' });
  await scenario('css-display default', 'css-display', {}, [],
    { d: 'defaults to "block"', fn: (s) => s === 'block' });
  await scenario('css-text', 'css-text', { cssText: 'font-weight: 700; letter-spacing: .02em' }, [],
    { d: 'emits the raw css text', fn: (s) => s === 'font-weight: 700; letter-spacing: .02em' });

  // css-color / css-width / css-height / css-font-size: relay the value
  await scenario('css-color', 'css-color', {}, [{ v: '#ff8800', in: 'input0' }],
    { d: 'relays the color', fn: (s) => s === '#ff8800' });
  await scenario('css-width', 'css-width', {}, [{ v: '320px', in: 'input0' }],
    { d: 'relays "320px"', fn: (s) => s === '320px' });
  await scenario('css-font-size', 'css-font-size', {}, [{ v: '1.25rem', in: 'input0' }],
    { d: 'relays "1.25rem"', fn: (s) => s === '1.25rem' });

  // css-margin / css-padding: T/R/B/L shorthand from wired sides
  await scenario('css-margin(4 sides)', 'css-margin', {}, [
    { v: '10px', in: 'input0' }, { v: '20px', in: 'input1' }, { v: '10px', in: 'input2' }, { v: '20px', in: 'input3' },
  ], { d: '"10px 20px 10px 20px"', fn: (s) => s === '10px 20px 10px 20px' });
  await scenario('css-padding(1 side)', 'css-padding', {}, [{ v: '8px', in: 'input0' }],
    { d: 'single wired side -> "8px"', fn: (s) => s === '8px' });
  await scenario('css-margin(none wired)', 'css-margin', {}, [],
    { d: 'no sides -> "" (safe)', fn: (s) => s === '' || s === 'START' });

  // css-join: __nodeCssJoin over inputs -> "decl; decl"
  await scenario('css-join', 'css-join', {}, [
    { v: 'color: red', in: 'input0' }, { v: 'font-weight: 700', in: 'input1' },
  ], { d: '"color: red; font-weight: 700"', fn: (s) => s === 'color: red; font-weight: 700' });
  await scenario('css-join(empty part skipped)', 'css-join', {}, [
    { v: 'color: red', in: 'input0' }, { v: '', in: 'input1' },
  ], { d: 'empty part dropped', fn: (s) => s === 'color: red' });

  // gradient: __nodeGradient(angle, ...colors) -> linear-gradient(...)
  await scenario('gradient(wired colors)', 'gradient', { gradientColors: ['#111', '#222', '#333'], gradientAngle: 45 }, [
    { v: '#aa0000', in: 'input0' }, { v: '#00aa00', in: 'input1' }, { v: '#0000aa', in: 'input2' },
  ], { d: 'linear-gradient(45deg, wired colors)', fn: (s) => /^linear-gradient\(45deg,\s*#aa0000,\s*#00aa00,\s*#0000aa\)$/.test(s) });
  await scenario('gradient(defaults from data)', 'gradient', { gradientColors: ['#f00', '#0f0', '#00f'], gradientAngle: 90 }, [],
    { d: 'linear-gradient(90deg, data colors)', fn: (s) => /^linear-gradient\(90deg,\s*#f00,\s*#0f0,\s*#00f\)$/.test(s) });

  // event-processor: passOnlyOnEvent false -> relay payload
  await scenario('event-processor(pass-through)', 'event-processor', { passOnlyOnEvent: false }, [
    { v: 'PAYLOAD', in: 'input1' },
  ], { d: 'relays payload when not gated', fn: (s) => s === 'PAYLOAD' });
  await scenario('event-processor(gated, no event)', 'event-processor', { passOnlyOnEvent: true }, [
    { v: 'PAYLOAD', in: 'input1' },
  ], { d: 'gated + no event -> not applied (sink unchanged / empty)', fn: (s) => s === 'START' || s === '' || s === 'undefined' });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
