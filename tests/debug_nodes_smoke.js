/* Debug folder (Console Log / Console Warning / Message Log / Message
 * Warning) + Number To Base / Parse Number pin labels.
 *   - shown only to logged-in editors unless the node says "Everyone"
 *   - no Trigger: shown when the value CHANGES (never on identical re-runs)
 *   - Trigger: once per event
 *   - value structure is readable; message boxes are text-only + closable
 *   - burst guard; value passes through unchanged
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const FRONT = fs.readFileSync(path.join(ROOT, 'frontend.js'), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data, x = 0, y = 0) => ({ id, name: id, type, x, y, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 180000);

async function editor(elements, connections) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1600; } });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 1000; } });
  const formulas = [], states = [];
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: (st) => states.push(st), onFormulaChange: (f) => formulas.push(f),
  });
  await wait(600);
  const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  if (b) b.click();
  await wait(300);
  return { w, formula: formulas[formulas.length - 1] || '', state: states[states.length - 1], card: (id) => w.document.querySelector(`[data-element-id="${id}"]`) };
}
function runtime(formula, { canDebug = false, body = '' } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${body}<div id="x" class="box">hello</div>
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e" data-post-id="1" data-output-configs="{}" style="display:none"></div></body>`,
  { runScripts: 'dangerously', url: 'https://s.test/page', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  if (canDebug) w.nodelogicFrontendDebug = { canDebug: true };
  const logs = [];
  w.console.log = (...a) => logs.push(['log', a]);
  w.console.warn = (...a) => logs.push(['warn', a]);
  w.document.getElementById('lb').setAttribute('data-formula', formula || '');
  let src = FRONT; const k = src.lastIndexOf('\n})();');
  src = src.slice(0, k) + '\n;window.__H={ recalc: scheduleRecalculation };' + src.slice(k);
  const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  const nl = () => logs.filter(([, a]) => typeof a[0] === 'string' && a[0].startsWith('[NodeLogic]'));
  return { w, doc: w.document, logs: nl, messages: () => Array.from(w.document.querySelectorAll('#nodelogic-debug-messages > div')) };
}
const recalc = async (w) => { w.__H.recalc(); await wait(80); };

(async () => {
  // ------------------------------------------------------------ editor
  ok('E palette has a Debug folder with the four nodes', /name:"Debug",type:"folder"/.test(BUNDLE) && /name:"Console Log",type:"debug-console-log"/.test(BUNDLE) && /name:"Console Warning",type:"debug-console-warn"/.test(BUNDLE)
    && /name:"Message Log",type:"debug-message-log"/.test(BUNDLE) && /name:"Message Warning",type:"debug-message-warn"/.test(BUNDLE));
  {
    const ed = await editor([
      mk('v', 'constant-string', { value: 'abc' }),
      mk('dbg', 'debug-console-log', { debugLabel: 'My value' }),
      mk('ref', 'element-ref', { elementUseManualId: true, customElementId: 'sink' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('alone', 'debug-message-warn', {}),
      mk('n', 'number', { value: 5 }),
    ], [cn('a', 'v', 'output0', 'dbg', 'input0'), cn('b', 'ref', 'output0', 'out', 'input0'), cn('c', 'dbg', 'output0', 'out', 'input1'), cn('d', 'n', 'output0', 'alone', 'input0')]);
    ok('E Debug node compiles to __nodeDebug with its label', /__nodeDebug\("dbg", "log", "My value", "abc", null, false, false\)/.test(ed.formula), ed.formula);
    ok('E a Debug node with nothing after it still runs (side-effect root)', /" nlSide:alone": \{ "__nlSideEffect": true, "value": __nodeDebug\("alone", "message-warn"/.test(ed.formula), ed.formula);
    ok('E Debug passes its value through (Output wire kept, typed like its input)', ed.state.connections.some((c) => c.fromId === 'dbg' && c.toId === 'out') && ed.state.elements.find((e) => e.id === 'dbg').valueType === 'string');
    const card = ed.card('dbg');
    ok('E Debug node: Label + "Show to" (editors by default) + Value/Trigger pins', card && /Show to/.test(card.textContent) && card.querySelector('select').value === 'editors'
      && Array.from(card.querySelectorAll('.input-label')).map((l) => l.textContent).join(',') === 'Value,Trigger', card && card.textContent);
  }
  {
    const ed = await editor([mk('tb', 'number-to-base', {}), mk('pn', 'number-parse', {})], []);
    const outs = (id) => Array.from(ed.card(id).querySelectorAll('.output-label')).map((l) => l.textContent).join(',');
    ok('E Number To Base output is labelled "Text" (it returns text, e.g. "ff")', outs('tb') === 'Text', outs('tb'));
    ok('E Parse Number output is labelled "Number" (it reads text into a number)', outs('pn') === 'Number', outs('pn'));
    ok('E Parse Number explains its dropdown ("Base of the text")', /Base of the text/.test(ed.card('pn').textContent), ed.card('pn').textContent);
    const types = Object.fromEntries(ed.state.elements.map((e) => [e.id, e.valueType]));
    ok('E types: Number To Base -> string, Parse Number -> number', types.tb === 'string' && types.pn === 'number', JSON.stringify(types));
  }

  // ------------------------------------------------------------ runtime
  const F_LOG = `({ " nlSide:d": { "__nlSideEffect": true, "value": __nodeDebug("d", "log", "Val", __nodeToString(__nodeGetElementProp(__nodeGetElement("in"), "value")), null, false, false) } })`;
  {
    const rt = runtime(F_LOG, { canDebug: false, body: '<input id="in" value="one">' });
    await wait(150);
    await recalc(rt.w);
    ok('R visitors (not a logged-in editor) see nothing', rt.logs().length === 0 && rt.messages().length === 0, JSON.stringify(rt.logs()));
  }
  {
    const rt = runtime(F_LOG, { canDebug: true, body: '<input id="in" value="one">' });
    await wait(150);
    ok('R editor: Console Log prints label + value once', rt.logs().length === 1 && rt.logs()[0][0] === 'log' && rt.logs()[0][1][0] === '[NodeLogic] Val:' && rt.logs()[0][1][1] === 'one', JSON.stringify(rt.logs()));
    await recalc(rt.w); await recalc(rt.w);
    ok('R the same value on later re-evaluations is not printed again', rt.logs().length === 1, String(rt.logs().length));
    rt.doc.getElementById('in').value = 'two';
    await recalc(rt.w);
    ok('R a changed value is printed', rt.logs().length === 2 && rt.logs()[1][1][1] === 'two', JSON.stringify(rt.logs().map((l) => l[1][1])));
  }
  {
    const f = `({ " nlSide:w": { "__nlSideEffect": true, "value": __nodeDebug("w", "warn", "Careful", 42, null, false, true) } })`;
    const rt = runtime(f);
    await wait(150);
    ok('R Console Warning uses console.warn; "Everyone" shows it without an editor login', rt.logs().length === 1 && rt.logs()[0][0] === 'warn' && rt.logs()[0][1][1] === 42, JSON.stringify(rt.logs()));
  }
  {
    const f = `({ " nlSide:m": { "__nlSideEffect": true, "value": __nodeDebug("m", "message", "Data", ({ "a": 1, "list": [1, "two"], "el": __nodeGetElement("x"), "html": "<img src=x onerror=window.__pwned=1>" }), null, false, false) } })`;
    const rt = runtime(f, { canDebug: true });
    await wait(150);
    const msgs = rt.messages();
    const text = msgs[0] ? msgs[0].textContent : '';
    ok('R Message Log shows a message box with the label', msgs.length === 1 && /Data/.test(text), text);
    ok('R ...with the value\'s structure (keys, arrays, elements)', /a: 1/.test(text) && /Array\(2\)/.test(text) && /"two"/.test(text) && /<div#x\.box> "hello"/.test(text), text);
    ok('R ...as TEXT only (a debugged string cannot inject markup)', !msgs[0].querySelector('img') && rt.w.__pwned === undefined && /onerror/.test(text));
    msgs[0].querySelector('button[aria-label="Close"]').click();
    ok('R the message can be closed', rt.messages().length === 0);
  }
  {
    const f = `({ " nlSide:mw": { "__nlSideEffect": true, "value": __nodeDebug("mw", "message-warn", "Warn", __nodeCustomEvent("tick"), __nodeCustomEvent("tick"), true, false) } })`;
    const rt = runtime(f, { canDebug: true });
    await wait(150);
    ok('R with a Trigger: nothing before the event', rt.messages().length === 0);
    for (let i = 0; i < 3; i++) { rt.w.dispatchEvent(new rt.w.CustomEvent('tick')); await wait(80); }
    const msgs = rt.messages();
    ok('R ...one Message Warning per event, styled as a warning', msgs.length === 3 && msgs.every((m) => m.classList.contains('nodelogic-debug-message--warning')), String(msgs.length));
    await recalc(rt.w);
    ok('R ...and none for a re-evaluation without a new event', rt.messages().length === 3);
    for (let i = 0; i < 30; i++) { rt.w.dispatchEvent(new rt.w.CustomEvent('tick')); await wait(20); }
    await wait(150);
    const warnings = rt.logs().filter(([kind, a]) => kind === 'warn' && /skipped for now/.test(a[0]));
    ok('R burst guard: at most 20 per 10s, one note that the rest were skipped; the screen keeps the 6 newest', rt.messages().length <= 6 && warnings.length === 1, `${rt.messages().length} / ${warnings.length}`);
  }
  {
    const f = `({ "o": { "__targetId": "sink", "value": __nodeDebug("p", "log", "P", 7, null, false, false) } })`;
    const rt = runtime(f, { body: '<div id="sink">-</div>' });
    await wait(150);
    ok('R the value passes through unchanged (also when nothing is shown)', rt.doc.getElementById('sink').textContent === '7');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
