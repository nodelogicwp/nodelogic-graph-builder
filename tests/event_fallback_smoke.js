/* Reported (2026-09-30):
 *  - Event Trigger Action's output pin was labeled "Output-1" instead of "Action".
 *  - Event -> Event Processor (payload) -> Output.Value delivered the payload
 *    even when the event had never fired: "pass only when event fires" was
 *    an opt-in, hidden in the sidebar and off by default. Now gated by
 *    default (only an explicit "pass always" relays unconditionally) and the
 *    toggle is on the node itself.
 *  - New Fallback Event node: Main is shown for Hold (ms) from the moment it
 *    appears, then the Fallback. An event-gated Main restarts the window on
 *    every firing; a constant Main appears once (on load) and, once its
 *    window expires, stays expired for good.
 *  - Send Email "Send test email" admin diagnostic button (editor side).
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
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 180000);

function editorWindow(pre) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  if (pre) pre(w);
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
async function mount(elements, connections, pre) {
  const w = editorWindow(pre);
  const formulas = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: () => {}, onFormulaChange: (f) => formulas.push(f),
  });
  await wait(700);
  return { w, formulas };
}
async function compile(elements, connections) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { w, formulas } = await mount(elements, connections);
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(attempt === 0 ? 400 : 900);
    if (formulas.length) return formulas[formulas.length - 1];
  }
  return '';
}
function boot(formula) {
  const dom = new JSDOM(`<!doctype html><body><button id="btn">Go</button><div id="sink1">-</div><div id="sink2">-</div>
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e" data-post-id="42" data-output-configs="{}" style="display:none"></div></body>`, { runScripts: 'dangerously', url: 'https://s.test/p', pretendToBeVisual: true });
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
const sink = (w, n = 1) => w.document.getElementById(`sink${n}`).textContent;
const click = (w) => w.document.getElementById('btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

(async () => {
  // ---- Event Trigger Action output label ----
  {
    const { w } = await mount([mk('gate', 'action-event-gate', {})], []);
    const labels = Array.from(w.document.querySelectorAll('[data-element-id="gate"] .output-label')).map((l) => l.textContent);
    ok('Event Trigger Action output is labeled "Action"', labels.join(',') === 'Action', labels.join(','));
  }

  // ---- Event Processor gated by default ----
  const epGraph = (epData) => ({
    els: [
      mk('ev', 'event-element', { eventUseManualId: true, eventId: 'btn' }),
      mk('msg', 'constant-string', { value: 'Hello' }),
      mk('ep', 'event-processor', epData),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    ],
    conns: [cn('c1', 'ev', 'output0', 'ep', 'input0'), cn('c2', 'msg', 'output0', 'ep', 'input1'), cn('c3', 'ep', 'output0', 'o1', 'input1')],
  });
  {
    const g = epGraph({}); // an existing node that never touched the option
    const f = await compile(g.els, g.conns);
    const { w, errs } = boot(f);
    await wait(150);
    ok('Event Processor (option never set): payload does NOT pass before the event', sink(w) === '-', sink(w));
    click(w);
    await wait(150);
    ok('Event Processor: payload passes when the event fires', sink(w) === 'Hello', sink(w));
    ok('Event Processor: no runtime error', errs.length === 0, errs.join(' | '));
  }
  {
    const g = epGraph({ passOnlyOnEvent: false }); // explicit "pass always" still works
    const f = await compile(g.els, g.conns);
    const { w } = boot(f);
    await wait(150);
    ok('Event Processor with explicit "pass always": payload passes without the event', sink(w) === 'Hello', sink(w));
  }
  {
    const { w } = await mount(epGraph({}).els, []);
    const box = w.document.querySelector('[data-element-id="ep"] input[type="checkbox"]');
    ok('Event Processor shows the "Only when event fires" toggle on the node, checked by default', !!box && box.checked === true, box ? String(box.checked) : 'no checkbox');
  }

  // ---- Fallback Event: constant Main ----
  {
    const f = await compile([
      mk('main', 'constant-string', { value: 'Welcome!' }),
      mk('fe', 'fallback-event', { fallbackEventValue: 'Idle', fallbackEventDurationMs: 400 }),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    ], [cn('c1', 'main', 'output0', 'fe', 'input0'), cn('c2', 'fe', 'output0', 'o1', 'input1')]);
    ok('Fallback Event compiles', f.includes('__nodeFallbackEvent('), f);
    const { w, errs } = boot(f);
    await wait(120);
    ok('constant Main: shown on load, inside its window', sink(w) === 'Welcome!', sink(w));
    await wait(500);
    ok('constant Main: after the window the Fallback shows', sink(w) === 'Idle', sink(w));
    w.dispatchEvent(new w.Event('resize'));
    await wait(200);
    ok('constant Main: stays expired for good (recalculation does not bring it back)', sink(w) === 'Idle', sink(w));
    ok('no runtime error', errs.length === 0, errs.join(' | '));
  }

  // ---- Fallback Event: event-gated Main ----
  {
    const f = await compile([
      mk('ev', 'event-element', { eventUseManualId: true, eventId: 'btn' }),
      mk('msg', 'constant-string', { value: 'Clicked!' }),
      mk('ep', 'event-processor', {}),
      mk('fe', 'fallback-event', { fallbackEventValue: 'Idle', fallbackEventDurationMs: 400 }),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    ], [
      cn('c1', 'ev', 'output0', 'ep', 'input0'), cn('c2', 'msg', 'output0', 'ep', 'input1'),
      cn('c3', 'ep', 'output0', 'fe', 'input0'), cn('c4', 'fe', 'output0', 'o1', 'input1'),
    ]);
    const { w } = boot(f);
    await wait(150);
    ok('event Main: Fallback before any event', sink(w) === 'Idle', sink(w));
    click(w);
    await wait(120);
    ok('event Main: shown right after the event', sink(w) === 'Clicked!', sink(w));
    w.dispatchEvent(new w.Event('resize'));
    await wait(100);
    ok('event Main: held through recalculations inside the window (no flicker)', sink(w) === 'Clicked!', sink(w));
    await wait(450);
    ok('event Main: back to Fallback when the window ends', sink(w) === 'Idle', sink(w));
    click(w);
    await wait(120);
    ok('event Main: a new firing restarts the window', sink(w) === 'Clicked!', sink(w));
  }

  // ---- Send test email button (admin) ----
  {
    const calls = [];
    const pre = (w) => {
      w.calcgraphProEditorConfig = { hasAccess: true, restUrl: 'https://editor.test/wp-json/calcgraph/v1/', restNonce: 'n', canManageDatabase: true };
      w.fetch = async (url, opts = {}) => {
        calls.push({ url: String(url), body: opts.body ? JSON.parse(opts.body) : null });
        return { ok: true, status: 200, json: async () => ({ ok: false, to: 'me@site.test', mailer: '', from: '', error: 'Invalid address:  (From): wordpress@localhost' }) };
      };
    };
    const { w } = await mount([mk('mail', 'send-email', { sendEmailRecipient: 'me@site.test' })], [], pre);
    const button = Array.from(w.document.querySelectorAll('[data-element-id="mail"] button')).find((b) => /send test email/i.test(b.textContent));
    ok('admin sees a "Send test email" button in Send Email', !!button);
    if (button) {
      button.click();
      await wait(150);
      const call = calls.find((c) => /send-email\/test$/.test(c.url));
      ok('the button calls the admin test route with the Recipient', call && call.body.to === 'me@site.test', JSON.stringify(call));
      ok('the WordPress error is shown on the node', /could not send: Invalid address/.test(w.document.querySelector('[data-element-id="mail"]').textContent), w.document.querySelector('[data-element-id="mail"]').textContent);
    }
    const outs = Array.from(w.document.querySelectorAll('[data-element-id="mail"] .output-label')).map((l) => l.textContent);
    ok('Send Email outputs: Status, Sending, Sent, Failed', outs.join(',') === 'Status,Sending,Sent,Failed', outs.join(','));
  }
  {
    const { w } = await mount([mk('mail', 'send-email', {})], []);
    ok('without admin/Pro config there is no test button', !Array.from(w.document.querySelectorAll('[data-element-id="mail"] button')).some((b) => /send test email/i.test(b.textContent)));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
