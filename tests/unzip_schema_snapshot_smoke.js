/* Reported bug: "Unzip connections from Form Data's Data (zip) are not saved
 * after saving the graph, and the email is never passed on."
 *
 * Unzip's field pins for a Form Data source come from LIVE detection of the
 * form in the editor preview. Whenever that detection was momentarily empty
 * (Elementor without its preview, editor just opened, a save in between),
 * Unzip fell back to one placeholder pin typed 'number', and type-flip
 * pruning deleted the email -> Send Email (string) wire. Fixed with a
 * per-Unzip schema snapshot used when live detection is unavailable, and by
 * never "type-pruning" a snapshot-source Unzip whose schema is unknown.
 * (The other half -- Send Email not compiled at all when nothing reads its
 * Status -- is covered in form_email_capture_resume_smoke.js, scenario J.)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
const FORM = '<form id="contact"><input name="name"><input name="email"><textarea name="message"></textarea></form>';
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 120000);

async function mountAndSave(state, withForm) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const dom = new JSDOM(`<!doctype html><body><div id="host"></div>${withForm ? FORM : ''}</body>`, { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.scrollTo = () => {};
    const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
    const states = []; const formulas = [];
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e', graphState: JSON.parse(JSON.stringify(state)),
      onStateChange: (st) => states.push(st), onFormulaChange: (f) => formulas.push(f),
    });
    await wait(attempt === 0 ? 900 : 1600);
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(attempt === 0 ? 400 : 900);
    if (states.length) return { state: states[states.length - 1], formula: formulas[formulas.length - 1] || '' };
  }
  return { state: { elements: [], connections: [] }, formula: '' };
}
const wires = (state) => (state.connections || []).map((c) => `${c.fromId}.${c.fromOutput}->${c.toId}.${c.toInput}`);
const EMAIL_WIRE = 'unzip.output1->mail.input0';

(async () => {
  const graph = {
    elements: [
      mk('form', 'form-data', { elementUseManualId: true, customElementId: 'contact' }),
      mk('unzip', 'unzip', {}),
      mk('mail', 'send-email', { sendEmailSubject: 'Hi', sendEmailMessage: 'Body' }),
    ],
    connections: [
      cn('c1', 'form', 'output0', 'unzip', 'input0'),
      cn('c2', 'unzip', 'output1', 'mail', 'input0'),
      cn('c3', 'form', 'output1', 'mail', 'input3'),
    ],
    formula: '', updatedAt: 0,
  };

  const first = await mountAndSave(graph, true);
  const snapshot = (first.state.elements.find((e) => e.id === 'unzip') || {}).data?.unzipSchemaSnapshot;
  ok('save with the form visible keeps the email wire', wires(first.state).includes(EMAIL_WIRE), JSON.stringify(wires(first.state)));
  ok('Unzip stores a snapshot of the detected fields', snapshot && snapshot.sourceId === 'form' && snapshot.fields.map((f) => f.id).join(',') === 'name,email,message', JSON.stringify(snapshot));
  ok('formula reads the email field by name', first.formula.includes('.values["email"]'), first.formula);

  const second = await mountAndSave(first.state, false);
  ok('re-opened WITHOUT the form in the preview: the email wire survives', wires(second.state).includes(EMAIL_WIRE), JSON.stringify(wires(second.state)));
  ok('...and the formula is unchanged (still reads values["email"])', second.formula === first.formula, second.formula);

  // A graph saved before snapshots existed, opened without the form.
  const legacy = await mountAndSave(graph, false);
  ok('legacy graph (no snapshot) opened without the form keeps its wires', wires(legacy.state).includes(EMAIL_WIRE), JSON.stringify(wires(legacy.state)));

  // Changing the source form for real still updates the snapshot.
  const reconnected = JSON.parse(JSON.stringify(first.state));
  reconnected.elements.find((e) => e.id === 'form').data.customElementId = 'missing-form';
  const third = await mountAndSave(reconnected, true);
  ok('a snapshot is never overwritten by a transient "nothing detected"', JSON.stringify((third.state.elements.find((e) => e.id === 'unzip') || {}).data?.unzipSchemaSnapshot) === JSON.stringify(snapshot));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
