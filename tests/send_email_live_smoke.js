/* Send Email: same-page (AJAX, no reload) submissions + live status.
 *
 * Reported: "the email is not sent to the user" and "the Status wired to an
 * Output does not update live"; also requested: Sending / Sent / Failed
 * event outputs so a graph can react (e.g. an Event Processor showing
 * "sending..." / "sent").
 *
 * A form whose page code calls preventDefault() (Elementor Form, most WP
 * form plugins: they submit over AJAX) never reloads -- the graph on THIS
 * page must run the submission. A plain native submit that navigates keeps
 * the capture -> reload -> resume flow (form_email_capture_resume_smoke.js).
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

const FORM = '<form id="myform"><input type="text" name="email" /><input type="text" name="name" /></form>';

async function compile(elements, connections, html = FORM) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const dom = new JSDOM(`<!doctype html><body><div id="host"></div>${html}</body>`, { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.scrollTo = () => {};
    const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
    const formulas = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
      onStateChange: () => {}, onFormulaChange: (f) => formulas.push(f),
    });
    await wait(attempt === 0 ? 900 : 1600);
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(attempt === 0 ? 400 : 900);
    if (formulas.length) return formulas[formulas.length - 1];
  }
  return '';
}

// Fake transport: send-email answers after `delay` ms with `reply`.
function transport(delay, reply) {
  return `
    (function(){
      window.__requests = [];
      function X(){ this._h = {}; }
      X.prototype.open = function(m, u, a){ this._m = m; this._u = u; };
      X.prototype.setRequestHeader = function(k, v){ this._h[k] = v; };
      X.prototype.send = function(body){
        const rec = { url: this._u, body: body };
        window.__requests.push(rec);
        const self = this;
        setTimeout(function(){
          self.status = /send-email/.test(self._u) && ${JSON.stringify(reply)}.__status ? ${JSON.stringify(reply)}.__status : 200;
          self.responseText = ${JSON.stringify(JSON.stringify(reply))};
          if (self.onload) self.onload();
        }, /send-email/.test(self._u) ? ${delay} : 0);
      };
      window.XMLHttpRequest = X;
      navigator.sendBeacon = function(){ return true; };
    })();`;
}

function boot(formula, pre, { ajaxForm = false, html = FORM } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${html}
    <div id="sink1">-</div><div id="sink2">-</div><div id="sink3">-</div><div id="sink4">-</div><div id="sink5">-</div>
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e" data-post-id="42" data-output-configs="{}" style="display:none"></div>
  </body>`, { runScripts: 'dangerously', url: 'https://s.test/page', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(w.performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  w.eval(`window.calcgraphProFrontendConfig = { restUrl: 'https://s.test/wp-json/calcgraph/v1/', nonce: 'n', formResumeNonce: 'fn' };`);
  w.eval(pre);
  if (ajaxForm) {
    // What Elementor Form / AJAX form plugins do: handle submit themselves.
    w.document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
  }
  w.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; w.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, errs };
}
const sink = (w, n) => w.document.getElementById(`sink${n}`).textContent;
const sends = (w) => (w.__requests || []).filter((r) => /send-email/.test(r.url));
function submit(w, email) {
  w.document.querySelector('input[name=email]').value = email;
  w.document.getElementById('myform').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}

(async () => {
  // Form Data -> Unzip(email) -> Send Email.Recipient; Submitted -> Trigger.
  // Status -> Unzip -> sink1 (sending), sink2 (ok), sink3 (error).
  const els = [
    mk('form', 'form-data', { elementUseManualId: true, customElementId: '#myform' }),
    mk('fields', 'unzip', {}),
    mk('mail', 'send-email', { sendEmailSubject: 'Thanks', sendEmailMessage: 'Got it' }),
    mk('st', 'unzip', {}),
    mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    mk('o2', 'output', { outputTargetElementPin: true, selectedElement: 'sink2' }),
    mk('o3', 'output', { outputTargetElementPin: true, selectedElement: 'sink3' }),
    // Requested: Sent / Sending events notify a payload (Event Processor).
    mk('sentMsg', 'constant-string', { value: 'Email sent!' }),
    mk('sentProc', 'event-processor', { passOnlyOnEvent: true }),
    mk('o4', 'output', { outputTargetElementPin: true, selectedElement: 'sink4' }),
    mk('sendingMsg', 'constant-string', { value: 'Sending...' }),
    mk('sendingProc', 'event-processor', { passOnlyOnEvent: true }),
    mk('o5', 'output', { outputTargetElementPin: true, selectedElement: 'sink5' }),
  ];
  const conns = [
    cn('c1', 'form', 'output0', 'fields', 'input0'),
    cn('c2', 'fields', 'output0', 'mail', 'input0'),
    cn('c3', 'form', 'output1', 'mail', 'input3'),
    cn('c4', 'mail', 'output0', 'st', 'input0'),
    cn('c5', 'st', 'output0', 'o1', 'input1'),
    cn('c6', 'st', 'output1', 'o2', 'input1'),
    cn('c7', 'st', 'output2', 'o3', 'input1'),
    cn('c8', 'mail', 'output2', 'sentProc', 'input0'),
    cn('c9', 'sentMsg', 'output0', 'sentProc', 'input1'),
    cn('c10', 'sentProc', 'output0', 'o4', 'input1'),
    cn('c11', 'mail', 'output1', 'sendingProc', 'input0'),
    cn('c12', 'sendingMsg', 'output0', 'sendingProc', 'input1'),
    cn('c13', 'sendingProc', 'output0', 'o5', 'input1'),
  ];
  const formula = await compile(els, conns);
  ok('graph compiles', formula.includes('__nodeSendEmail('), formula);

  // ---- A: AJAX form (no reload) ----
  {
    const { w, errs } = boot(formula, transport(150, { ok: true }), { ajaxForm: true });
    await wait(100);
    submit(w, 'first@example.com');
    await wait(60);
    ok('A: AJAX form: the email is sent on the SAME page (no reload needed)', sends(w).length === 1, String(sends(w).length));
    ok('A: to = the address typed into the form', sends(w)[0] && JSON.parse(sends(w)[0].body).to === 'first@example.com', sends(w)[0] && sends(w)[0].body);
    ok('A: while the request is in flight, Status.sending shows true live', sink(w, 1) === 'true', `sending=${sink(w, 1)}`);
    ok('A: the Sending event delivered its payload', sink(w, 5) === 'Sending...', `sink5=${sink(w, 5)}`);
    ok('A: the Sent event has NOT fired yet', sink(w, 4) === '-', `sink4=${sink(w, 4)}`);
    await wait(250);
    ok('A: after the response, Status.ok flips to true live', sink(w, 2) === 'true' && sink(w, 1) === 'false', `sending=${sink(w, 1)} ok=${sink(w, 2)}`);
    ok('A: the Sent event delivered its payload after the response', sink(w, 4) === 'Email sent!', `sink4=${sink(w, 4)}`);
    ok('A: an AJAX submission leaves no resume marker behind (no surprise send on the next visit)', Object.keys({ ...w.localStorage }).filter((k) => k.startsWith('nodelogic_pending_submit_')).length === 0, JSON.stringify({ ...w.localStorage }));
    await wait(600); // past the 800ms double-submit guard
    submit(w, 'second@example.com');
    await wait(900);
    ok('A: a SECOND AJAX submission on the same page sends a second email', sends(w).length === 2 && JSON.parse(sends(w)[1].body).to === 'second@example.com', String(sends(w).length));
    w.dispatchEvent(new w.Event('resize'));
    await wait(150);
    ok('A: recalculations never re-send', sends(w).length === 2, String(sends(w).length));
    ok('A: no runtime error', errs.length === 0, errs.join(' | '));
  }

  // ---- B: failure surfaces live ----
  {
    const { w } = boot(formula, transport(50, { ok: false, error: 'SMTP down' }), { ajaxForm: true });
    await wait(100);
    submit(w, 'x@example.com');
    await wait(300);
    ok('B: a failed send shows ok=false and the error live', sink(w, 2) === 'false' && sink(w, 3) === 'SMTP down', `ok=${sink(w, 2)} error=${sink(w, 3)}`);
  }

  // ---- C: a server refusal shows the SERVER's reason, not a generic one ----
  {
    const { w } = boot(formula, transport(20, { __status: 403, code: 'calcgraph_anonymous_not_allowed', message: 'This action is not enabled for anonymous visitors.' }), { ajaxForm: true });
    await wait(100);
    submit(w, 'y@example.com');
    await wait(250);
    ok('C: a 403 shows the server reason in Status.error', sink(w, 3) === 'This action is not enabled for anonymous visitors.', `error=${sink(w, 3)}`);
  }

  // ---- D: Elementor Form widget: the CSS ID sits on the widget WRAPPER,
  //      fields are named form_fields[...], and it submits over AJAX ----
  {
    const EL_FORM = '<div id="contact-widget" class="elementor-element elementor-widget-form"><div class="elementor-widget-container">'
      + '<form class="elementor-form" name="New Form"><input type="text" name="form_fields[name]"><input type="email" name="form_fields[email]"></form>'
      + '</div></div>';
    const dEls = [
      mk('form', 'form-data', { elementUseManualId: true, customElementId: 'contact-widget' }),
      mk('fields', 'unzip', {}),
      mk('mail', 'send-email', { sendEmailSubject: 'Thanks', sendEmailMessage: 'Got it' }),
    ];
    const dConns = [
      cn('c1', 'form', 'output0', 'fields', 'input0'),
      cn('c2', 'fields', 'output1', 'mail', 'input0'), // form_fields[email]
      cn('c3', 'form', 'output1', 'mail', 'input3'),
    ];
    const dFormula = await compile(dEls, dConns, EL_FORM);
    ok('D: Unzip reads the Elementor field by its real name', dFormula.includes('values["form_fields[email]"]'), dFormula);
    const { w, errs } = boot(dFormula, transport(20, { ok: true }), { ajaxForm: true, html: EL_FORM });
    await wait(100);
    w.document.querySelector('input[name="form_fields[email]"]').value = 'el@example.com';
    w.document.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await wait(200);
    ok('D: Elementor form (ID on the wrapper) sends the email', sends(w).length === 1 && JSON.parse(sends(w)[0].body).to === 'el@example.com', sends(w).map((r) => r.body).join(' | '));
    ok('D: no capture failure logged', errs.length === 0, errs.join(' | '));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
