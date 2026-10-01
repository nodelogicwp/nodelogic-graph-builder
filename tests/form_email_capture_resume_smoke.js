/* Form Data / Send Email (PRO) regression suite.
 *
 * Covers the submit -> capture -> reload -> resume flow end to end against
 * the REAL compiled editor bundle (dist/build/elementor.js) and the REAL
 * frontend.js runtime -- not a reimplementation of either.
 *
 * A "reload" is simulated with two independent JSDOM windows (a real reload
 * wipes every in-memory JS global except localStorage) with localStorage
 * contents copied across, exactly matching what a real browser guarantees
 * and nothing more.
 *
 * Kept to as FEW editor compile() calls as practical -- each one mounts a
 * real React tree in a fresh JSDOM window and is the dominant cost of this
 * suite; scenarios that only differ in which field is read share ONE
 * compiled graph with several Output sinks instead of one graph each.
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
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 240000);

// `extraBodyHtml` mirrors the live page's own form into the EDITOR's preview
// context too -- previewResolver.ts's getPreviewDocuments() checks the top
// document first, and Form Data / Unzip's schema detection needs a real
// `#myform` there to find anything at compile time, exactly like a real
// editor session has the actual page's form in its live preview.
function makeEditorWindow(extraBodyHtml) {
  const dom = new JSDOM(`<!doctype html><body><div id="host"></div>${extraBodyHtml || ''}</body>`, { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
const TEST_FORM_HTML = `<form id="myform"><input type="text" name="email" /><input type="checkbox" name="agree" /><select name="plan"><option value="basic">basic</option><option value="pro">pro</option></select><textarea name="notes"></textarea></form>`;
// This exact harness's own existing suites (see api_async_smoke.js) document
// that the very first compile() in a fresh process is occasionally slower to
// settle than a fixed wait accounts for; under a loaded/slow host that same
// risk can resurface on later calls too. One retry (with a longer wait) is
// cheap insurance against that class of flake, not a fix for a real bug.
async function compile(elements, connections, extraBodyHtml) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const w = makeEditorWindow(extraBodyHtml);
    const fcalls = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
      onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
    });
    await wait(attempt === 0 ? 500 : 1200);
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(attempt === 0 ? 300 : 700);
    const f = fcalls[fcalls.length - 1];
    if (f) return f;
  }
  return '';
}

function withFakeTransport(responder, opts) {
  const beaconOk = !opts || opts.beaconOk !== false;
  return `
    (function(){
      window.__requests = [];
      function X(){ this._h={}; }
      X.prototype.open=function(m,u,a){ this._m=m; this._u=u; this._async=(a!==false); };
      Object.defineProperty(X.prototype,'withCredentials',{ set:function(v){ this._wc=v; }, get:function(){ return this._wc; } });
      X.prototype.setRequestHeader=function(k,v){ this._h[k]=v; };
      X.prototype.send=function(b){
        this._body=b;
        const rec = { method: this._m, url: this._u, body: b, headers: Object.assign({}, this._h) };
        window.__requests.push(rec);
        const self = this;
        const respond = () => {
          const r = (${responder})(rec);
          self.status = r.status;
          self.statusText = r.statusText || '';
          self.responseText = r.responseText;
          if (r.error === 'network') { if (self.onerror) self.onerror(); return; }
          if (r.error === 'timeout') { if (self.ontimeout) self.ontimeout(); return; }
          if (self.onload) self.onload();
        };
        if (this._async === false) { respond(); } else { setTimeout(respond, 0); }
      };
      window.XMLHttpRequest = X;
      navigator.sendBeacon = function(url, blob) {
        window.__requests.push({ method: 'BEACON', url: url, body: blob && blob.__body });
        return ${beaconOk ? 'true' : 'false'};
      };
    })();
  `;
}
const BLOB_SHIM = `
  (function(){
    const RealBlob = window.Blob;
    window.Blob = function(parts, opts){ const b = new RealBlob(parts, opts); b.__body = parts && parts[0]; return b; };
  })();
`;

function boot(formula, editorId, preScript) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="sink1">START</div>
    <div id="sink2">START</div>
    <div id="sink3">START</div>
    <div id="sink4">START</div>
    <form id="myform">
      <input type="text" name="email" />
      <input type="checkbox" name="agree" />
      <select name="plan"><option value="basic">basic</option><option value="pro">pro</option></select>
      <textarea name="notes"></textarea>
    </form>
    <div data-nodelogic-logic="1" id="lb" data-editor-id="${editorId}" data-post-id="42" data-output-configs="{}" style="display:none"></div>
  </body>`, { runScripts: 'dangerously', url: 'https://s.test/page', pretendToBeVisual: true });
  dom.window.eval(CSSP);
  dom.window.eval(BLOB_SHIM);
  let rafId = 1;
  dom.window.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(dom.window.performance.now()), 0); return id; };
  dom.window.cancelAnimationFrame = () => {};
  if (preScript) dom.window.eval(preScript);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; dom.window.console.error = (...a) => errs.push(a.map(String).join(' '));
  const s = dom.window.document.createElement('script'); s.textContent = FRONT; dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  return { dom, errs };
}

function withProConfig() {
  return `window.calcgraphProFrontendConfig = { restUrl: 'https://s.test/wp-json/calcgraph/v1/', nonce: 'n', formResumeNonce: 'fn' };`;
}
function copyLocalStorage(fromWindow, toWindow) {
  for (let i = 0; i < fromWindow.localStorage.length; i++) {
    const key = fromWindow.localStorage.key(i);
    toWindow.localStorage.setItem(key, fromWindow.localStorage.getItem(key));
  }
}
function submitForm(dom) {
  dom.window.document.getElementById('myform').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}
const okJson = (body) => new Function('rec', `return { status: 200, statusText: 'OK', responseText: ${JSON.stringify(JSON.stringify(body))} };`);
function readSink(dom, n) { return dom.window.document.getElementById(`sink${n || 1}`).textContent; }

// One Form Data node feeding FOUR api-field extractors (email/agree/plan/
// notes) into four sinks, plus (optionally) a Send Email node gated on the
// SAME node's Submitted (event) output -- covers capture-shape correctness
// and the email trigger in a single compiled graph.
function fullGraph(sendEmail) {
  const els = [
    mk('form', 'form-data', { selectedElement: '', elementUseManualId: true, customElementId: '#myform' }),
    mk('f1', 'api-field', { apiFieldPath: 'values.email', apiFieldType: 'string' }),
    mk('f2', 'api-field', { apiFieldPath: 'values.agree', apiFieldType: 'string' }),
    mk('f3', 'api-field', { apiFieldPath: 'values.plan', apiFieldType: 'string' }),
    mk('f4', 'api-field', { apiFieldPath: 'values.notes', apiFieldType: 'string' }),
    mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    mk('o2', 'output', { outputTargetElementPin: true, selectedElement: 'sink2' }),
    mk('o3', 'output', { outputTargetElementPin: true, selectedElement: 'sink3' }),
    mk('o4', 'output', { outputTargetElementPin: true, selectedElement: 'sink4' }),
  ];
  const conns = [
    cn('w1', 'form', 'output0', 'f1', 'input0'), cn('w1o', 'f1', 'output0', 'o1', 'input1'),
    cn('w2', 'form', 'output0', 'f2', 'input0'), cn('w2o', 'f2', 'output0', 'o2', 'input1'),
    cn('w3', 'form', 'output0', 'f3', 'input0'), cn('w3o', 'f3', 'output0', 'o3', 'input1'),
    cn('w4', 'form', 'output0', 'f4', 'input0'), cn('w4o', 'f4', 'output0', 'o4', 'input1'),
  ];
  if (sendEmail) {
    els.push(mk('email', 'send-email', { sendEmailSubject: 'New submission', sendEmailMessage: 'static message' }));
    conns.push(cn('w5', 'form', 'output1', 'email', 'input3'));
    els.push(mk('recipient', 'constant-string', { value: sendEmail.recipient }));
    conns.push(cn('w6', 'recipient', 'output0', 'email', 'input0'));
    els.push(mk('f5', 'api-field', { apiFieldPath: 'ok', apiFieldType: 'boolean' }));
    els.push(mk('f6', 'api-field', { apiFieldPath: 'error', apiFieldType: 'string' }));
    els.push(mk('o5', 'output', { outputTargetElementPin: true, selectedElement: 'sink3' })); // reuse sink3 for status.ok
    els.push(mk('o6', 'output', { outputTargetElementPin: true, selectedElement: 'sink4' })); // reuse sink4 for status.error
    conns.push(cn('w7', 'email', 'output0', 'f5', 'input0'), cn('w7o', 'f5', 'output0', 'o5', 'input1'));
    conns.push(cn('w8', 'email', 'output0', 'f6', 'input0'), cn('w8o', 'f6', 'output0', 'o6', 'input1'));
  }
  return { els, conns };
}

(async () => {
  // ---- Compile the two graphs used throughout, ONCE ----
  const plainFormula = await compile(...Object.values(fullGraph()));
  const emailFormula = await compile(...Object.values(fullGraph({ recipient: 'to@example.com' })));
  ok('setup: both graphs compiled', !!plainFormula && !!emailFormula, `plain=${JSON.stringify(plainFormula)} email=${JSON.stringify(emailFormula)}`);

  // ---- A: fresh page, no submission yet -> all empty, no crash ----
  {
    const { dom, errs } = boot(plainFormula, 'e1', withProConfig());
    await wait(80);
    ok('A: no crash on fresh load', errs.filter((e) => /Cannot read|is not a function|not safe/i.test(e)).length === 0, errs.join(';'));
    ok('A: no pending submission -> all fields empty', readSink(dom) === '' && readSink(dom, 2) === '' && readSink(dom, 3) === '' && readSink(dom, 4) === '', JSON.stringify([readSink(dom), readSink(dom, 2), readSink(dom, 3), readSink(dom, 4)]));
  }

  // ---- B: submit -> reload -> resume carries every field type through ----
  {
    const { dom: d1 } = boot(plainFormula, 'e1', withProConfig());
    await wait(50);
    d1.window.document.querySelector('input[name=email]').value = 'visitor@example.com';
    d1.window.document.querySelector('input[name=agree]').checked = true;
    d1.window.document.querySelector('select[name=plan]').value = 'pro';
    // notes left empty on purpose -- covers the empty-field case in the same pass.
    submitForm(d1);
    await wait(50);
    const markerKey = Object.keys({ ...d1.window.localStorage }).find((k) => k.startsWith('nodelogic_pending_submit_'));
    ok('B: submit persists a local resume marker before any reload', !!markerKey, 'no localStorage marker written');

    const { dom: d2, errs: errs2 } = boot(plainFormula, 'e1', withProConfig());
    copyLocalStorage(d1.window, d2.window);
    await wait(80);
    ok('B: no crash on resume', errs2.filter((e) => /Cannot read|is not a function|not safe/i.test(e)).length === 0, errs2.join(';'));
    ok('B: text field resumes', readSink(d2, 1) === 'visitor@example.com', `sink1=${JSON.stringify(readSink(d2, 1))}`);
    ok('B: checked boolean-style checkbox resumes as true', readSink(d2, 2) === 'true', `sink2=${JSON.stringify(readSink(d2, 2))}`);
    ok('B: select resumes', readSink(d2, 3) === 'pro', `sink3=${JSON.stringify(readSink(d2, 3))}`);
    ok('B: empty textarea resumes as empty string, not lost/undefined', readSink(d2, 4) === '', `sink4=${JSON.stringify(readSink(d2, 4))}`);

    // Single-use: a THIRD load with the same (already-consumed) storage never resumes again.
    const { dom: d3 } = boot(plainFormula, 'e1', withProConfig());
    copyLocalStorage(d2.window, d3.window);
    await wait(80);
    ok('B: resume is single-use (third load sees nothing)', readSink(d3, 1) === '', `sink1=${JSON.stringify(readSink(d3, 1))}`);
  }

  // ---- C: unchecked checkbox resumes as false; a rapid double-submit is not doubled ----
  {
    const { dom } = boot(plainFormula, 'e1', withProConfig());
    await wait(50);
    dom.window.document.querySelector('input[name=email]').value = 'a@example.com';
    // agree left unchecked on purpose.
    submitForm(dom);
    submitForm(dom); // near-simultaneous second submit, same click/Enter
    await wait(50);
    const keys = Object.keys({ ...dom.window.localStorage }).filter((k) => k.startsWith('nodelogic_pending_submit_'));
    ok('C: exactly one pending marker after a rapid double-submit', keys.length === 1, `keys=${JSON.stringify(keys)}`);

    const { dom: d2 } = boot(plainFormula, 'e1', withProConfig());
    copyLocalStorage(dom.window, d2.window);
    await wait(80);
    ok('C: unchecked checkbox resumes as false', readSink(d2, 2) === 'false', `sink2=${JSON.stringify(readSink(d2, 2))}`);
  }

  // ---- D: two genuinely separate submissions -> last-submit-wins ----
  {
    const { dom: d1 } = boot(plainFormula, 'e1', withProConfig());
    await wait(50);
    d1.window.document.querySelector('input[name=email]').value = 'first@example.com';
    submitForm(d1);
    await wait(50);
    d1.window.document.getElementById('myform').dataset.nlSubmitLock = ''; // simulate the lock's own auto-release
    d1.window.document.querySelector('input[name=email]').value = 'second@example.com';
    submitForm(d1);
    await wait(50);

    const { dom: d2 } = boot(plainFormula, 'e1', withProConfig());
    copyLocalStorage(d1.window, d2.window);
    await wait(80);
    ok('D: resuming after two submissions reflects the LATEST one', readSink(d2, 1) === 'second@example.com', `sink1=${JSON.stringify(readSink(d2, 1))}`);
  }

  // ---- E: a stale (tampered/too old) marker is rejected, not resumed ----
  {
    const { dom: d1 } = boot(plainFormula, 'e1', withProConfig());
    await wait(50);
    d1.window.document.querySelector('input[name=email]').value = 'stale@example.com';
    submitForm(d1);
    await wait(50);
    const key = Object.keys({ ...d1.window.localStorage }).find((k) => k.startsWith('nodelogic_pending_submit_'));
    const raw = JSON.parse(d1.window.localStorage.getItem(key));
    raw.capturedAt = Date.now() - 60 * 60 * 1000; // 1h old -- past the 30 min cutoff
    d1.window.localStorage.setItem(key, JSON.stringify(raw));

    const { dom: d2 } = boot(plainFormula, 'e1', withProConfig());
    copyLocalStorage(d1.window, d2.window);
    await wait(80);
    ok('E: a stale marker (tampered capturedAt) is rejected, not resumed', readSink(d2, 1) === '', `sink1=${JSON.stringify(readSink(d2, 1))}`);
  }

  // ---- F: without PRO active, the whole feature is inert ----
  {
    const { dom: d1 } = boot(plainFormula, 'e1'); // no withProConfig() -- calcgraphProFrontendConfig absent
    await wait(50);
    d1.window.document.querySelector('input[name=email]').value = 'nopro@example.com';
    submitForm(d1);
    await wait(50);
    const keys = Object.keys({ ...d1.window.localStorage }).filter((k) => k.startsWith('nodelogic_pending_submit_'));
    ok('F: without PRO active, submit never writes a resume marker', keys.length === 0, `keys=${JSON.stringify(keys)}`);
  }

  // ---- G: Send Email fires exactly once per resumed submission, with the right payload ----
  {
    const { dom: d1 } = boot(emailFormula, 'e1', withProConfig());
    await wait(50);
    submitForm(d1);
    await wait(50);
    const { dom: d2, errs: errs2 } = boot(emailFormula, 'e1', withProConfig());
    copyLocalStorage(d1.window, d2.window);
    d2.window.eval(withFakeTransport(okJson({ ok: true })));
    await wait(200);
    ok('G: no crash', errs2.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs2.join(';'));
    const sendReqs = (d2.window.__requests || []).filter((r) => /send-email/.test(r.url));
    ok('G: exactly one send-email request for one resumed submission', sendReqs.length === 1, `count=${sendReqs.length}`);
    if (sendReqs.length === 1) {
      const body = JSON.parse(sendReqs[0].body);
      ok('G: recipient/subject/message reach the request', body.to === 'to@example.com' && body.subject === 'New submission' && body.message === 'static message', JSON.stringify(body));
      ok('G: postId/blockEditorId/nodeId included for server-side re-authorization', body.postId === '42' && body.blockEditorId === 'e1' && !!body.nodeId, JSON.stringify(body));
    }
    ok('G: status.ok reflects the (faked) successful send', readSink(d2, 3) === 'true', `sink3=${JSON.stringify(readSink(d2, 3))}`);
  }

  // ---- H: HTTP failure on send-email surfaces as ok:false with an error, no crash; unwired Trigger never fires on its own ----
  {
    const { dom: d1 } = boot(emailFormula, 'e1', withProConfig());
    await wait(50);
    submitForm(d1);
    await wait(50);
    const { dom: d2, errs: errs2 } = boot(emailFormula, 'e1', withProConfig());
    copyLocalStorage(d1.window, d2.window);
    d2.window.eval(withFakeTransport(() => ({ status: 500, statusText: 'Server Error', responseText: 'boom' })));
    await wait(200);
    ok('H: no crash on a failed send', errs2.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs2.join(';'));
    ok('H: HTTP failure surfaces ok=false with a non-empty error', readSink(d2, 3) === 'false' && readSink(d2, 4) !== '', `sink3=${JSON.stringify(readSink(d2, 3))} sink4=${JSON.stringify(readSink(d2, 4))}`);

    // No submission ever happened on a THIRD, fresh page -- Send Email's
    // Trigger is unwired-equivalent (no pending resume), so it must never
    // reach the network on plain recalculation.
    const { dom: d3 } = boot(emailFormula, 'e1', withProConfig());
    d3.window.eval(withFakeTransport(okJson({ ok: true })));
    await wait(150);
    const sendReqs = (d3.window.__requests || []).filter((r) => /send-email/.test(r.url));
    ok('H: no pending submission -> Send Email never fires on plain recalculation', sendReqs.length === 0, `count=${sendReqs.length}`);
  }

  // ---- I: Form Data's Data (zip) output wired into Unzip -- one labeled pin
  // per detected field (named by the field's real `name`, not a generic
  // "Output N"), each still resolving to the right captured value at runtime.
  {
    const els = [
      mk('form', 'form-data', { selectedElement: '', elementUseManualId: true, customElementId: '#myform' }),
      mk('unzip', 'unzip', {}),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
      mk('o2', 'output', { outputTargetElementPin: true, selectedElement: 'sink2' }),
    ];
    const conns = [
      cn('w1', 'form', 'output0', 'unzip', 'input0'), // Data (zip) -> Unzip, NOT the Submitted/event output1
      cn('w2', 'unzip', 'output0', 'o1', 'input1'),
      cn('w3', 'unzip', 'output1', 'o2', 'input1'),
    ];
    const f = await compile(els, conns, TEST_FORM_HTML);

    const { dom: d1 } = boot(f, 'e1', withProConfig());
    await wait(50);
    d1.window.document.querySelector('input[name=email]').value = 'unzip@example.com';
    d1.window.document.querySelector('input[name=agree]').checked = true;
    submitForm(d1);
    await wait(50);
    const { dom: d2, errs: errs2 } = boot(f, 'e1', withProConfig());
    copyLocalStorage(d1.window, d2.window);
    await wait(80);
    ok('I: no crash', errs2.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs2.join(';'));
    ok('I: Unzip pin 0 (email) resolves to the submitted value', readSink(d2, 1) === 'unzip@example.com', `sink1=${JSON.stringify(readSink(d2, 1))}`);
    ok('I: Unzip pin 1 (agree) resolves to true', readSink(d2, 2) === 'true', `sink2=${JSON.stringify(readSink(d2, 2))}`);
  }

  // ---- J (reported bug): Form Data -> Unzip(email) -> Send Email recipient,
  //      with NOTHING reading Send Email's Status. Previously the whole Send
  //      Email node was left out of the compiled formula (only Output nodes
  //      were compiled), so the email was never sent. ----
  {
    const els = [
      mk('form', 'form-data', { selectedElement: '', elementUseManualId: true, customElementId: '#myform' }),
      mk('unzip', 'unzip', {}),
      mk('mail', 'send-email', { sendEmailSubject: 'Thanks', sendEmailMessage: 'We got it' }),
    ];
    const conns = [
      cn('w1', 'form', 'output0', 'unzip', 'input0'),
      cn('w2', 'unzip', 'output0', 'mail', 'input0'), // email field -> Recipient
      cn('w3', 'form', 'output1', 'mail', 'input3'),  // Submitted -> Trigger
    ];
    const f = await compile(els, conns, TEST_FORM_HTML);
    ok('J: Send Email with an unread Status is still compiled', f.includes('__nodeSendEmail('), f);

    const { dom: d1 } = boot(f, 'e1', withProConfig());
    await wait(50);
    d1.window.document.querySelector('input[name=email]').value = 'visitor@example.com';
    submitForm(d1);
    await wait(50);
    const { dom: d2, errs: errs2 } = boot(f, 'e1', withProConfig());
    copyLocalStorage(d1.window, d2.window);
    d2.window.eval(withFakeTransport(okJson({ ok: true })));
    await wait(200);
    const sendReqs = (d2.window.__requests || []).filter((r) => /send-email/.test(r.url));
    ok('J: no crash', errs2.filter((e) => /Cannot read|is not a function/i.test(e)).length === 0, errs2.join(';'));
    ok('J: exactly one email is sent after the submit -> reload', sendReqs.length === 1, `count=${sendReqs.length}`);
    ok('J: the recipient is the email typed into the form (via Unzip)', sendReqs[0] && JSON.parse(sendReqs[0].body).to === 'visitor@example.com', sendReqs[0] && sendReqs[0].body);
    const before = sendReqs.length;
    d2.window.dispatchEvent(new d2.window.Event('resize'));
    await wait(150);
    ok('J: a later recalculation does not send it again', (d2.window.__requests || []).filter((r) => /send-email/.test(r.url)).length === before);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
