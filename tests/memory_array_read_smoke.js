/* Regression test for the new `memory-array-read` node ("Read Array
 * Variable" in PRO's Memory Logic palette folder).
 *
 * Gap: memory-array-append/memory-array-remove already existed (and already
 * auto-init to [] and return the resulting array), but there was no
 * side-effect-free way to just READ the current array -- e.g. to display it,
 * or feed it into array-map/array-for-each, without triggering a mutation.
 *
 * Fix: memory-array-read compiles to the exact same, already-existing,
 * already-correct __nodeMemoryGet(key, [], persist, scope) call that
 * append/remove already use internally before mutating -- no new runtime
 * function, no new storage mechanism, same widget/page scoping as every
 * other memory-* node.
 */
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
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 60000);

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
function boot(formula) {
  const dom = new JSDOM(`<!doctype html><body><div id="sink">START</div>
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
  dom.window.eval(CSSP);
  let rafId = 1;
  dom.window.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(dom.window.performance.now()), 0); return id; };
  dom.window.cancelAnimationFrame = () => {};
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { dom, errs };
}
const readSink = (dom) => dom.window.document.getElementById('sink').textContent;

async function readScenario(label, variableKey, expectedJson) {
  const els = [mk('n', 'memory-array-read', { variableKey }), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' })];
  const conns = [cn('w', 'n', 'output0', 'o', 'input1')];
  const f = await gen(els, conns);
  const { dom, errs } = boot(f);
  const noErr = errs.filter((e) => /Cannot read|is not a function|SyntaxError|not safe/i.test(e)).length === 0;
  ok(`${label}: no crash`, noErr, errs.join(';') + ' | ' + f);
  ok(`${label}: reads ${expectedJson}`, readSink(dom) === expectedJson, `sink=${JSON.stringify(readSink(dom))} formula=${f}`);
}

(async () => {
  // 1) missing array -> []
  await readScenario('missing array', 'never_set_array_key', '[]');

  // 2) existing array -> existing values (pre-seed then read, same pass)
  {
    const f = `({
      "a": { "__targetId": "seed", "value": __nodeMemorySet("seeded_arr", [1, 2, 3], false, "widget") },
      "b": { "__targetId": "sink", "value": __nodeMemoryGet("seeded_arr", [], false, "widget") }
    })`;
    const dom2 = new JSDOM(`<!doctype html><body><div id="seed">START</div><div id="sink">START</div>
      <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none" data-formula="${f.replace(/"/g, '&quot;')}"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
    dom2.window.eval(CSSP);
    const errs = []; dom2.window.console.error = (...a) => errs.push(a.map(String).join(' '));
    const s = dom2.window.document.createElement('script'); s.textContent = FRONT; dom2.window.document.body.appendChild(s);
    dom2.window.document.dispatchEvent(new dom2.window.Event('DOMContentLoaded', { bubbles: true }));
    ok('existing array: no crash', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
    ok('existing array: reads the existing values [1,2,3]', readSink(dom2) === '[1,2,3]', readSink(dom2));
  }

  // 3) append -> read returns appended values (append's own key evaluates
  // BEFORE the read's key in this object literal -- same real-graph shape as
  // wiring an Append node and a separate Read node into two Output nodes).
  {
    const els = [
      mk('append', 'memory-array-append', { variableKey: 'grown_arr' }),
      mk('item', 'constant-string', { value: 'x' }),
      mk('read', 'memory-array-read', { variableKey: 'grown_arr' }),
      mk('oAppend', 'output', { outputTargetElementPin: true, selectedElement: 'appendSink' }),
      mk('oRead', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ];
    const conns = [
      cn('c0', 'item', 'output0', 'append', 'input0'),
      cn('c1', 'append', 'output0', 'oAppend', 'input1'),
      cn('c2', 'read', 'output0', 'oRead', 'input1'),
    ];
    const f = await gen(els, conns);
    const dom3 = new JSDOM(`<!doctype html><body><div id="appendSink">START</div><div id="sink">START</div>
      <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none" data-formula="${(f || '').replace(/"/g, '&quot;')}"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
    dom3.window.eval(CSSP);
    const errs = []; dom3.window.console.error = (...a) => errs.push(a.map(String).join(' '));
    const s = dom3.window.document.createElement('script'); s.textContent = FRONT; dom3.window.document.body.appendChild(s);
    dom3.window.document.dispatchEvent(new dom3.window.Event('DOMContentLoaded', { bubbles: true }));
    ok('append -> read: no crash', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';') + ' | ' + f);
    ok('append -> read: read sees the appended item', readSink(dom3) === '["x"]' || readSink(dom3).includes('x'), readSink(dom3));
  }

  // 4) read does not mutate: reading the same key twice in one pass, then
  // again across a fresh recalculation, must always show the same value.
  {
    const f = `({
      "a": { "__targetId": "sinkA", "value": __nodeMemoryGet("readonly_arr", [1, 2], false, "widget") },
      "b": { "__targetId": "sinkB", "value": __nodeMemoryGet("readonly_arr", [1, 2], false, "widget") }
    })`;
    const dom4 = new JSDOM(`<!doctype html><body><div id="sinkA">START</div><div id="sinkB">START</div>
      <input id="trigger" data-formula="1" style="display:none">
      <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none" data-formula="${f.replace(/"/g, '&quot;')}"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
    dom4.window.eval(CSSP);
    let rafId4 = 1;
    dom4.window.requestAnimationFrame = (cb) => { const id = rafId4++; setTimeout(() => cb(dom4.window.performance.now()), 0); return id; };
    dom4.window.cancelAnimationFrame = () => {};
    const s = dom4.window.document.createElement('script'); s.textContent = FRONT; dom4.window.document.body.appendChild(s);
    dom4.window.document.dispatchEvent(new dom4.window.Event('DOMContentLoaded', { bubbles: true }));
    await wait(80);
    const first = { a: readSink2(dom4, 'sinkA'), b: readSink2(dom4, 'sinkB') };
    ok('read does not mutate: two reads in one pass agree', first.a === first.b && first.a === '[1,2]', JSON.stringify(first));
    // Trigger an unrelated recalculation -- with no append/write anywhere,
    // the value must be byte-identical again.
    dom4.window.document.getElementById('trigger').dispatchEvent(new dom4.window.Event('input', { bubbles: true }));
    await wait(100);
    const second = { a: readSink2(dom4, 'sinkA'), b: readSink2(dom4, 'sinkB') };
    ok('read does not mutate: unchanged after an unrelated recalculation', second.a === '[1,2]' && second.b === '[1,2]', JSON.stringify(second));
  }

  // 5) Elementor widget instances remain isolated (mirrors the existing
  // duplicated-widget scoping coverage in memory_system_smoke.js).
  {
    const editorId = 'nodelogic-elementor-array-dup';
    const fA = `({ "a1": { "__targetId": "appendA", "value": __nodeMemoryArrayAppend("dup_arr", "fromA", true, false, "widget") }, "a2": { "__targetId": "readA", "value": __nodeMemoryGet("dup_arr", [], false, "widget") } })`;
    const fB = `({ "b2": { "__targetId": "readB", "value": __nodeMemoryGet("dup_arr", [], false, "widget") } })`;
    const html = `<!doctype html><body>
      <div id="appendA">START</div><div id="readA">START</div><div id="readB">START</div>
      <div data-nodelogic-logic="1" id="lbA" data-editor-id="${editorId}" data-output-configs="{}" style="display:none" data-formula="${fA.replace(/"/g, '&quot;')}"></div>
      <div data-nodelogic-logic="1" id="lbB" data-editor-id="${editorId}" data-output-configs="{}" style="display:none" data-formula="${fB.replace(/"/g, '&quot;')}"></div>
    </body>`;
    const dom5 = new JSDOM(html, { runScripts: 'dangerously', url: 'https://s.test/' });
    dom5.window.eval(CSSP);
    const errs = []; dom5.window.console.error = (...a) => errs.push(a.map(String).join(' '));
    const s = dom5.window.document.createElement('script'); s.textContent = FRONT; dom5.window.document.body.appendChild(s);
    dom5.window.document.dispatchEvent(new dom5.window.Event('DOMContentLoaded', { bubbles: true }));
    ok('widget isolation: no crash across 2 duplicated blocks', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
    ok('widget isolation: block A appended its own item', readSink2(dom5, 'readA') === '["fromA"]', readSink2(dom5, 'readA'));
    ok('widget isolation: block B (default widget scope) does NOT see block A\'s array', readSink2(dom5, 'readB') === '[]', readSink2(dom5, 'readB'));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();

function readSink2(dom, id) { return dom.window.document.getElementById(id).textContent; }
