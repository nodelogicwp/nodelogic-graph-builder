/* Memory system regression suite.
 *
 * BUG 1 (compiler gap, same class as the hex-conversion bug): memory-read-*
 * / memory-write-* had NO case in the formula-generation switch, so they
 * silently fell through to the identity pass-through `default:` branch.
 * PRO's own palette (pro-editor-config.js) already advertises these types,
 * so this was a real, reachable bug for any PRO user wiring a memory node
 * -- not merely dormant. Fixed by adding explicit cases that call the
 * existing (already-correct) __nodeMemoryGet/__nodeMemorySet runtime.
 *
 * BUG 2 (runtime, found auditing the same subsystem): window.memoryStore /
 * memoryPersistFlags / memoryDefaults were flat globals keyed only by the
 * user-chosen variable name, with NO per-widget scoping -- unlike
 * window.nodelogicActionBindings (already fixed for the identical
 * duplicated-Elementor-widget collision class). Two duplicated widgets using
 * a memory node with the same variable name would silently read/overwrite
 * each other's value, including in localStorage (site-wide, not just one
 * page). Fixed via __nodeMemoryResolveKey, which folds the runtime
 * blockScope into the storage key by default ('widget' scope), with an
 * explicit 'page' scope opt-out for intentional cross-widget sharing.
 *
 * NEW capability (PRO expansion): memory-has / memory-delete /
 * memory-increment / memory-array-append / memory-array-remove. The four
 * mutating ones are gated behind the SAME eventKey/triggeredCount/
 * consumedCount idiom already used for memory-write's `reset` input, so
 * they don't fire on every unrelated page recalculation.
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
function ev(formula, extraHtml) {
  const dom = new JSDOM(`<!doctype html><body>${extraHtml || '<div id="sink">START</div>'}
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
  dom.window.eval(CSSP);
  // jsdom has no requestAnimationFrame; scheduleRecalculation() (fired by
  // click/input listeners) depends on a real one in production -- polyfill
  // it as a macrotask (see tests/event_repeat_execution_smoke.js) so a click
  // actually drives a fresh applyLogicBlocks pass instead of silently no-op'ing.
  let rafId = 1;
  dom.window.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(dom.window.performance.now()), 0); return id; };
  dom.window.cancelAnimationFrame = () => {};
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { dom, errs };
}
function readSink(dom, id) { return dom.window.document.getElementById(id).textContent; }
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 200000);

async function scenario(label, nodeType, nodeData, sources, check) {
  const els = [mk('n', nodeType, nodeData), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink' })];
  const conns = [cn('wo', 'n', 'output0', 'o', 'input1')];
  sources.forEach((s, i) => { els.push(mk('s' + i, s.t, s.d)); conns.push(cn('w' + i, 's' + i, 'output0', 'n', s.in)); });
  const f = await gen(els, conns);
  const { dom, errs } = ev(f);
  const noErr = errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected|not safe/i.test(e)).length === 0;
  ok(`${label}: no crash`, noErr, errs.join(';') + ' | ' + JSON.stringify(f));
  ok(`${label}: ${check.d}`, check.fn(readSink(dom, 'sink')), `sink=${JSON.stringify(readSink(dom, 'sink'))} formula=${JSON.stringify(f)}`);
}

(async () => {
  // ---- Part 1: compiler-wiring correctness (the actual bug fix) ----------
  await scenario('READ number (unwritten -> default)', 'memory-read-number', { variableKey: 'p1_num', defaultValue: 7 }, [],
    { d: 'reads default 7', fn: (s) => s === '7' });
  await scenario('READ string (unwritten -> default)', 'memory-read-string', { variableKey: 'p1_str', defaultValue: 'hi' }, [],
    { d: 'reads default "hi"', fn: (s) => s === 'hi' });
  await scenario('READ boolean (unwritten -> default)', 'memory-read-boolean', { variableKey: 'p1_bool', defaultValue: true }, [],
    { d: 'reads default true', fn: (s) => s === 'true' });
  await scenario('WRITE number echoes written value (not passthrough of a stale/other value)', 'memory-write-number', { variableKey: 'p1_w' },
    [{ t: 'number', d: { value: 42 }, in: 'input0' }], { d: 'echoes 42', fn: (s) => s === '42' });
  await scenario('HAS: unset key -> false', 'memory-has', { variableKey: 'p1_never_set' }, [],
    { d: 'false', fn: (s) => s === 'false' });
  await scenario('INCREMENT unwired trigger: default step 1 from 0', 'memory-increment', { variableKey: 'p1_inc', incrementStep: 1 }, [],
    { d: '0 + 1 = 1', fn: (s) => s === '1' });
  await scenario('ARRAY-APPEND unwired trigger: empty array + item', 'memory-array-append', { variableKey: 'p1_arr' },
    [{ t: 'constant-string', d: { value: 'x' }, in: 'input0' }], { d: '["x"]', fn: (s) => s === 'x' || s.includes('x') });

  // ---- Part 2: duplicated-widget scoping (the runtime collision bug) -----
  {
    // Three independent logic blocks, same page, same data-editor-id (the
    // exact "Elementor native Duplicate" shape from event_isolation_smoke.js
    // section 5c) -- blockIndex still disambiguates them.
    const editorId = 'nodelogic-elementor-shared111';
    const fA = `({ "oa": { "__targetId": "writeSinkA", "value": __nodeMemorySet("shared_key", "A", false, "widget") } })`;
    const fB = `({ "ob": { "__targetId": "writeSinkB", "value": __nodeMemorySet("shared_key", "B", false, "widget") } })`;
    const fC = `({ "oc": { "__targetId": "readSinkC", "value": __nodeMemoryGet("shared_key", "EMPTY", false, "widget") } })`;
    const html = `<!doctype html><body>
      <div id="writeSinkA">START</div><div id="writeSinkB">START</div><div id="readSinkC">START</div>
      <div data-nodelogic-logic="1" id="lbA" data-editor-id="${editorId}" data-output-configs="{}" style="display:none" data-formula="${fA.replace(/"/g, '&quot;')}"></div>
      <div data-nodelogic-logic="1" id="lbB" data-editor-id="${editorId}" data-output-configs="{}" style="display:none" data-formula="${fB.replace(/"/g, '&quot;')}"></div>
      <div data-nodelogic-logic="1" id="lbC" data-editor-id="${editorId}" data-output-configs="{}" style="display:none" data-formula="${fC.replace(/"/g, '&quot;')}"></div>
    </body>`;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://s.test/' });
    dom.window.eval(CSSP);
    const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
    const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));

    ok('scoping: no runtime error across 3 duplicated blocks', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
    ok('scoping: block A echoes its own write ("A")', readSink(dom, 'writeSinkA') === 'A', readSink(dom, 'writeSinkA'));
    ok('scoping: block B echoes its own write ("B")', readSink(dom, 'writeSinkB') === 'B', readSink(dom, 'writeSinkB'));
    ok('scoping: independent block C reads its OWN default ("EMPTY"), not A or B\'s value -- the actual collision bug',
      readSink(dom, 'readSinkC') === 'EMPTY', `got ${JSON.stringify(readSink(dom, 'readSinkC'))} -- a flat global key would leak whichever of A/B wrote last`);
  }

  // ---- Part 2b: 'page' scope opt-in still allows intentional sharing -----
  {
    const editorId = 'nodelogic-elementor-page222';
    const fA = `({ "oa": { "__targetId": "writeSinkA2", "value": __nodeMemorySet("shared_page_key", "fromA", false, "page") } })`;
    const fC = `({ "oc": { "__targetId": "readSinkC2", "value": __nodeMemoryGet("shared_page_key", "EMPTY", false, "page") } })`;
    const html = `<!doctype html><body>
      <div id="writeSinkA2">START</div><div id="readSinkC2">START</div>
      <div data-nodelogic-logic="1" id="lbA2" data-editor-id="${editorId}" data-output-configs="{}" style="display:none" data-formula="${fA.replace(/"/g, '&quot;')}"></div>
      <div data-nodelogic-logic="1" id="lbC2" data-editor-id="${editorId}" data-output-configs="{}" style="display:none" data-formula="${fC.replace(/"/g, '&quot;')}"></div>
    </body>`;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://s.test/' });
    dom.window.eval(CSSP);
    const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
    ok('page scope: independent block C intentionally SEES block A\'s value ("fromA") when both opt into page scope',
      readSink(dom, 'readSinkC2') === 'fromA', readSink(dom, 'readSinkC2'));
  }

  // ---- Part 3: mutating ops are trigger-gated, not "every recalculation" -
  {
    const f = `({ "o": { "__targetId": "sink", "value": __nodeMemoryIncrement("gated_counter", 1, __nodeEvent("btn", "click"), false, "widget") } })`;
    const { dom, errs } = ev(f, '<button id="btn">go</button><div id="sink">START</div>');
    // Initial load: no click yet -> increments once from the page-load pass
    // itself is expected (no trigger wired -> always-apply semantics only
    // apply when trigger is truly unwired; here it IS wired to a click event,
    // so the untriggered initial state must NOT have incremented past a
    // single settle, and repeated recalcs without a NEW click must not climb.
    await wait(50);
    const afterLoad = readSink(dom, 'sink');
    dom.window.document.dispatchEvent(new dom.window.Event('resize'));
    await wait(50);
    const afterResizeNoClick = readSink(dom, 'sink');
    ok('increment: no runtime error', errs.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs.join(';'));
    ok('increment: unrelated recalculation (resize, no click) does not increment again',
      afterResizeNoClick === afterLoad, `afterLoad=${afterLoad} afterResize=${afterResizeNoClick}`);
    for (let i = 0; i < 3; i++) {
      dom.window.document.getElementById('btn').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      await wait(50);
    }
    const afterThreeClicks = Number(readSink(dom, 'sink'));
    ok('increment: exactly 3 clicks advance the counter by exactly 3 from its post-load value',
      afterThreeClicks === Number(afterLoad) + 3, `afterLoad=${afterLoad} afterThreeClicks=${afterThreeClicks}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
