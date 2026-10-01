/* Two independent regression fixes from user bug reports, covered together
 * since both were found while testing the Form/Email + Unzip work:
 *
 *  1) Unzip only ever unpacked a custom-node's own positionally-keyed zip
 *     shape (o0/field-1/... convention) or Form Data's live-detected form
 *     fields -- wiring it to any OTHER named-key zip producer (Send Email's
 *     Status: {sending, ok, error}; API Status: {ok, status, statusText,
 *     error, loading}) produced a node with the right pin COUNT but every
 *     pin silently resolved to "" (__nodeUnzip's own key-miss fallback),
 *     since those real key names never match the o0/field-1 convention.
 *     Fixed by generalizing the "known named schema" resolution
 *     (getUnzipSchemaForSource) beyond form-data to also recognize these
 *     fixed-shape producers, with correct labels/types per field.
 *
 *  2) Action If (`action-if`) fell through to the wrong branches in TWO
 *     places: getAcceptedTypesForPin had no case for it (silently accepting
 *     'string' on its Condition pin instead of 'boolean'), and getInputLabel's
 *     switch case list omitted 'action-if' entirely (an existing
 *     'action-if'-specific label rule inside that switch was unreachable
 *     dead code) -- both pins showed the generic "Input 1"/"Input 2"
 *     fallback instead of "Action"/"Condition".
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 90000);

function makeEditorWindow(extraBodyHtml) {
  const dom = new JSDOM(`<!doctype html><body><div id="host"></div>${extraBodyHtml || ''}</body>`, { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  w.eval(CSSP);
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
// See api_async_smoke.js: the first compile() in a fresh process can be
// slower to settle than a fixed wait accounts for; one retry with a longer
// wait is cheap insurance against that class of flake.
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
    if (f) return { w, formula: f };
  }
  return { w: null, formula: '' };
}

(async () => {
  await compile([mk('n', 'number', { value: 1 }), mk('o', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' })], [cn('w', 'n', 'output0', 'o', 'input1')]);

  // ---- Unzip on Send Email's Status: named pins, correct extraction ----
  {
    const formEl = `<form id="myform"><input type="text" name="email" /></form>`;
    const els = [
      mk('form', 'form-data', { selectedElement: '', elementUseManualId: true, customElementId: '#myform' }),
      mk('email', 'send-email', { sendEmailSubject: 's', sendEmailMessage: 'm' }),
      mk('recipient', 'constant-string', { value: 'to@example.com' }),
      mk('unzip', 'unzip', {}),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
      mk('o2', 'output', { outputTargetElementPin: true, selectedElement: 'sink2' }),
    ];
    const conns = [
      cn('w5', 'form', 'output1', 'email', 'input3'),
      cn('w6', 'recipient', 'output0', 'email', 'input0'),
      cn('w7', 'email', 'output0', 'unzip', 'input0'),
      cn('w8', 'unzip', 'output0', 'o1', 'input1'),
      cn('w9', 'unzip', 'output1', 'o2', 'input1'),
    ];
    const { w, formula } = await compile(els, conns, formEl);
    ok('Send Email -> Unzip compiles', !!formula, formula);
    if (w) {
      const cardText = (w.document.querySelector('.canvas-element.type-unzip')?.textContent || '').replace(/\s+/g, ' ');
      ok('Unzip shows real field labels ("Sending"/"Ok"), not generic Output N', /Sending/.test(cardText) && /Ok/.test(cardText), cardText);
    }
  }

  // ---- Action If: correct pin labels/types ----
  {
    const els = [
      mk('cond', 'constant-boolean', { value: true }),
      mk('act', 'action-if', {}),
      mk('n', 'number', { value: 1 }),
      mk('o1', 'output', { outputTargetElementPin: true, selectedElement: 'sink1' }),
    ];
    const conns = [
      cn('w3', 'cond', 'output0', 'act', 'input1'),
      cn('w4', 'n', 'output0', 'o1', 'input1'),
    ];
    const { w, formula } = await compile(els, conns);
    ok('action-if graph compiles', !!formula, formula);
    if (w) {
      const cardText = (w.document.querySelector('.canvas-element.type-action-if')?.textContent || '').replace(/\s+/g, ' ');
      ok('action-if shows "Action" and "Condition" labels', /Action/.test(cardText) && /Condition/.test(cardText), cardText);
      ok('action-if does not fall back to generic "Input 1"/"Input 2"', !/Input 1/.test(cardText) && !/Input 2/.test(cardText), cardText);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
