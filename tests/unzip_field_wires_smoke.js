/* Unzip of DB rows:
 *  1. Wires follow their FIELD when the field list changes (DB Fields
 *     ticked / unticked): a wire on "price" stays on "price" even though its
 *     pin moves; a wire whose field disappears is removed -- never silently
 *     re-pointed at another field.
 *  2. An Unzip on a For Each loop item over DB Select's Rows knows the row's
 *     columns (pins named after them, compiled by column name), also through
 *     item-preserving array ops (Filter / Sort ...), and works at runtime.
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

const SCHEMA = { connections: [{ id: 'wp', label: 'WordPress database', type: 'wp', status: 'ok', defaultDatabase: 'shop', databases: ['shop'], error: '' }] };
const COLUMNS = [
  { name: 'id', type: 'int', nullable: false, key: 'PRI', autoIncrement: true },
  { name: 'name', type: 'varchar', nullable: true, key: '', autoIncrement: false },
  { name: 'price', type: 'decimal', nullable: true, key: '', autoIncrement: false },
];

function mount(elements, connections) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/wp-admin/post.php', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1600; } });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 1000; } });
  const errors = [];
  w.console.error = (...a) => errors.push(a.map(String).join(' '));
  w.calcgraphProEditorConfig = { hasAccess: true, restUrl: 'https://editor.test/wp-json/calcgraph/v1/', restNonce: 'n', canManageDatabase: true };
  w.elementor = { config: { document: { id: 42 } } };
  w.fetch = async (url) => {
    const u = String(url);
    let body = {};
    if (u.includes('db/editor-schema')) body = SCHEMA;
    else if (u.includes('db/tables')) body = { ok: true, tables: ['products'] };
    else if (u.includes('db/columns')) body = { ok: true, columns: COLUMNS };
    else if (u.includes('db/sign')) body = { ok: true, signature: 'nls1:x' };
    return { ok: true, status: 200, json: async () => body };
  };
  const states = [];
  const formulas = [];
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: (st) => states.push(st), onFormulaChange: (f) => formulas.push(f),
  });
  const save = async () => {
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(300);
  };
  const card = (id) => w.document.querySelector(`[data-element-id="${id}"]`);
  return { w, errors, save, card, state: () => states[states.length - 1], formula: () => formulas[formulas.length - 1] || '' };
}
const outLabels = (card) => Array.from(card.querySelectorAll('.output-label')).map((l) => l.textContent);
const wiresFrom = (st, id) => st.connections.filter((c) => c.fromId === id).map((c) => `${c.fromOutput}->${c.toId}`).sort().join(',');

(async () => {
  const chain = [
    mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'shop' }, 0, 0),
    mk('t', 'db-table', { dbTable: 'products' }, 300, 0),
    mk('fl', 'db-fields', { dbFields: ['id', 'name', 'price'] }, 600, 0),
    mk('sel', 'db-select', { dbLimit: 10, dbExecutePolicy: 'anyone' }, 900, 0),
  ];
  const chainWires = [cn('c0', 'k', 'output0', 't', 'input0'), cn('c1', 't', 'output0', 'fl', 'input0'), cn('c2', 'fl', 'output0', 'sel', 'input0')];

  // ============================================================ 1
  {
    const env = mount([
      ...chain,
      mk('uz', 'unzip', {}, 1200, 0),
      mk('sName', 'string-trim', {}, 1500, 0),
      mk('sPrice', 'number-to-string', {}, 1500, 200),
      mk('ref1', 'element-ref', { elementUseManualId: true, customElementId: 'sink' }, 1500, 400),
      mk('out1', 'output', { outputTargetElementPin: true }, 1800, 200),
    ], [
      ...chainWires,
      cn('u0', 'sel', 'output1', 'uz', 'input0'),
      cn('u1', 'uz', 'output1', 'sName', 'input0'),   // name
      cn('u2', 'uz', 'output2', 'sPrice', 'input0'),  // price
      cn('u3', 'ref1', 'output0', 'out1', 'input0'),
      cn('u4', 'sPrice', 'output0', 'out1', 'input1'),
    ]);
    await wait(1800);
    await env.save();
    ok('1 Unzip of First Row shows the selected columns as pins', outLabels(env.card('uz')).join(',') === 'id,name,price', outLabels(env.card('uz')).join(','));
    ok('1 wires start on name (pin 1) and price (pin 2)', wiresFrom(env.state(), 'uz') === 'output1->sName,output2->sPrice', wiresFrom(env.state(), 'uz'));

    // Untick "name" in DB Fields: price moves from pin 2 to pin 1.
    const nameBox = Array.from(env.card('fl').querySelectorAll('label.reverse-toggle')).find((l) => l.textContent.trim() === 'name');
    nameBox.querySelector('input').click();
    await wait(1600);
    await env.save();
    ok('1 after unticking "name": pins are id,price', outLabels(env.card('uz')).join(',') === 'id,price', outLabels(env.card('uz')).join(','));
    ok('1 the price wire FOLLOWED price to its new pin; the name wire is gone (not re-pointed)', wiresFrom(env.state(), 'uz') === 'output1->sPrice', wiresFrom(env.state(), 'uz'));
    ok('1 the compiled formula reads price by name for that wire', /\["price"\]/.test(env.formula()) && !/\["name"\]/.test(env.formula()), env.formula().slice(0, 500));

    // Tick "name" again: pins id,name,price; the price wire moves back to pin 2.
    const nameBox2 = Array.from(env.card('fl').querySelectorAll('label.reverse-toggle')).find((l) => l.textContent.trim() === 'name');
    nameBox2.querySelector('input').click();
    await wait(1600);
    await env.save();
    ok('1 ticking it back: the price wire follows price again (pin 2), nothing lands on name', wiresFrom(env.state(), 'uz') === 'output2->sPrice', wiresFrom(env.state(), 'uz'));
    ok('1 editor: no errors', env.errors.filter((e) => /before initialization|Cannot read|is not a function/.test(e)).length === 0, env.errors.join(' | ').slice(0, 300));
  }

  // ============================================================ 2
  let loopFormula = '';
  {
    const env = mount([
      ...chain,
      mk('flt', 'array-filter', {}, 1200, 300),
      mk('fe', 'array-for-each', {}, 1500, 300),
      mk('uz', 'unzip', {}, 1800, 300),
      mk('col', 'array-collect', {}, 2100, 300),
      mk('ref', 'element-ref', { elementUseManualId: true, customElementId: 'sink' }, 2100, 0),
      mk('out', 'output', { outputTargetElementPin: true }, 2400, 300),
    ], [
      ...chainWires,
      cn('r0', 'sel', 'output0', 'fe', 'input0'),
      cn('r1', 'fe', 'output0', 'uz', 'input0'),
      cn('r2', 'uz', 'output1', 'col', 'input0'),
      cn('r3', 'ref', 'output0', 'out', 'input0'),
      cn('r4', 'col', 'output0', 'out', 'input1'),
    ]);
    await wait(1800);
    await env.save();
    ok('2 Unzip on a For Each item over DB Rows shows the row\'s columns', outLabels(env.card('uz')).join(',') === 'id,name,price', outLabels(env.card('uz')).join(','));
    loopFormula = env.formula();
    ok('2 it compiles by column name (not the positional default)', /__nodeLoopItem\)\["name"\]/.test(loopFormula.replace(/\\"/g, '"')) && !/__nodeUnzip\(/.test(loopFormula), loopFormula.slice(0, 600));
    const snap = env.state().elements.find((e) => e.id === 'uz').data.unzipSchemaSnapshot;
    ok('2 its schema is snapshotted (survives a save without the DB schema loaded)', snap && snap.sourceId === 'fe' && snap.fields.map((f) => f.id).join(',') === 'id,name,price', JSON.stringify(snap));
  }
  {
    // Same, with an item-preserving Filter between Rows and For Each.
    const env = mount([
      ...chain,
      mk('srt', 'array-sort', {}, 1200, 300),
      mk('fe', 'array-for-each', {}, 1500, 300),
      mk('uz', 'unzip', {}, 1800, 300),
    ], [...chainWires, cn('r0', 'sel', 'output0', 'srt', 'input0'), cn('r1', 'srt', 'output0', 'fe', 'input0'), cn('r2', 'fe', 'output0', 'uz', 'input0')]);
    await wait(1800);
    ok('2 ...also through Sort between Rows and For Each', outLabels(env.card('uz')).join(',') === 'id,name,price', outLabels(env.card('uz')).join(','));
  }
  {
    // Runtime: rows from the (faked) PRO endpoint -> For Each -> Unzip(name) -> Collect.
    const dom = new JSDOM('<!doctype html><body><div id="sink">-</div><div data-nodelogic-logic="1" id="lb" data-editor-id="e" data-post-id="42" data-output-configs="{}" style="display:none"></div></body>', { runScripts: 'dangerously', url: 'https://s.test/page', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(CSSP);
    w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
    w.calcgraphProFrontendConfig = { restUrl: 'https://s.test/wp-json/calcgraph/v1/', nonce: 'nonce-1' };
    w.eval(`(function(){ function X(){} X.prototype.open=function(){}; X.prototype.setRequestHeader=function(){}; X.prototype.send=function(){ var s=this; setTimeout(function(){ s.status=200; s.responseText=JSON.stringify({ ok:true, rows:[{id:1,name:'Lamp',price:9.5},{id:2,name:'Desk',price:120}], count:2 }); if(s.onload) s.onload(); },0); }; window.XMLHttpRequest=X; })();`);
    w.document.getElementById('lb').setAttribute('data-formula', loopFormula);
    const errs = []; w.console.error = (...a) => errs.push(a.map(String).join(' '));
    const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await wait(300);
    ok('2 runtime: each row\'s "name" comes out of the Unzip', /Lamp/.test(w.document.getElementById('sink').textContent) && /Desk/.test(w.document.getElementById('sink').textContent), w.document.getElementById('sink').textContent + ' | ' + errs.join(';'));
  }

  // ============================================================ 3
  // Reported: DB Select Rows -> For Each -> Unzip -> Raw HTML (slot) ->
  // Set Parent took the WHOLE logic block on the page down. Set Parent is a
  // side-effect root; it was compiled outside the loop, so Unzip read the
  // rows ARRAY ("rows[\"name\"]"), the runtime refused that, and one failing
  // entry invalidated every Output of the block.
  const runPage = async (formula) => {
    const dom = new JSDOM('<!doctype html><body><ul id="list"></ul><div id="other">-</div><div data-nodelogic-logic="1" id="lb" data-editor-id="e" data-post-id="42" data-output-configs="{}" style="display:none"></div></body>', { runScripts: 'dangerously', url: 'https://s.test/page', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(CSSP);
    w.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 0);
    w.calcgraphProFrontendConfig = { restUrl: 'https://s.test/wp-json/calcgraph/v1/', nonce: 'nonce-1' };
    w.eval(`(function(){ function X(){} X.prototype.open=function(){}; X.prototype.setRequestHeader=function(){}; X.prototype.send=function(){ var s=this; setTimeout(function(){ s.status=200; s.responseText=JSON.stringify({ ok:true, rows:[{id:1,name:'Lamp',price:9.5},{id:2,name:'Desk',price:120}], count:2 }); if(s.onload) s.onload(); },0); }; window.XMLHttpRequest=X; })();`);
    w.document.getElementById('lb').setAttribute('data-formula', formula);
    const logs = [];
    w.console.error = (...a) => logs.push(`error ${a.map(String).join(' ')}`);
    w.console.warn = (...a) => logs.push(`warn ${a.map(String).join(' ')}`);
    const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await wait(400);
    return { w, logs, rows: () => Array.from(w.document.querySelectorAll('#list .row')).map((r) => r.textContent).join(','), other: () => w.document.getElementById('other').textContent };
  };
  {
    const env = mount([
      ...chain,
      mk('fe', 'array-for-each', {}, 1200, 0),
      mk('uz', 'unzip', {}, 1500, 0),
      mk('raw', 'raw-html', { rawHtml: '<li class="row"><span>x</span></li>', rawHtmlSlots: ['li.row/span|text'] }, 1800, 0),
      mk('list', 'element-ref', { elementUseManualId: true, customElementId: 'list' }, 1800, 300),
      mk('sp', 'set-parent', { setParentPosition: 'end' }, 2100, 0),
      // an unrelated Output in the same logic block
      mk('n', 'number', { value: 7 }, 1800, 600),
      mk('otherRef', 'element-ref', { elementUseManualId: true, customElementId: 'other' }, 1800, 800),
      mk('out', 'output', { outputTargetElementPin: true }, 2100, 600),
    ], [
      ...chainWires,
      cn('r0', 'sel', 'output0', 'fe', 'input0'),
      cn('r1', 'fe', 'output0', 'uz', 'input0'),
      cn('r2', 'uz', 'output1', 'raw', 'input0'),
      cn('r3', 'raw', 'output0', 'sp', 'input0'),
      cn('r4', 'list', 'output0', 'sp', 'input1'),
      cn('r5', 'otherRef', 'output0', 'out', 'input0'),
      cn('r6', 'n', 'output0', 'out', 'input1'),
    ]);
    await wait(1800);
    await env.save();
    const formula = env.formula().replace(/\\"/g, '"');
    ok('3 Set Parent fed by a For Each item compiles INSIDE the loop (per row)', /" nlSide:sp": \{ "__nlSideEffect": true, "value": __nodeArrayMapGraph\(/.test(formula) && /__nodeLoopItem\)\["name"\]/.test(formula), formula.slice(0, 500));
    ok('3 ...and never reads the rows array as one item', !/__nodeArrayForEach\(/.test(formula), formula.slice(0, 500));
    ok('3 editor: no errors', env.errors.filter((e) => /before initialization|Cannot read|is not a function/.test(e)).length === 0, env.errors.join(' | ').slice(0, 300));
    const page = await runPage(env.formula());
    ok('3 runtime: one Raw HTML element per row, placed into the parent, in row order', page.rows() === 'Lamp,Desk', page.w.document.getElementById('list').innerHTML);
    ok('3 runtime: the rest of the logic block keeps working', page.other() === '7', page.other());
    ok('3 runtime: nothing reported as broken', page.logs.length === 0, page.logs.join(' | '));
  }
  {
    // Defense in depth: a block whose formula still has a broken entry (e.g.
    // compiled by an older editor) keeps every OTHER entry working, and the
    // failure is reported once instead of being swallowed.
    const broken = '({ " nlSide:sp": { "__nlSideEffect": true, "value": __nodeSetParent("sp", __nodeRawHtml("raw", "<li class=\\"row\\"><span>x</span></li>", [["0", "text", ""]], [(__nodeArrayForEach(["a"]))["name"]]), __nodeGetElement("list"), "end", null, false) }, "o": { "__targetId": "other", "value": 5 } })';
    const page = await runPage(broken);
    ok('3 runtime: one failing entry no longer disables the other Outputs of the block', page.other() === '5', page.other());
    const warnings = page.logs.filter((line) => /could not be evaluated and was skipped \(nlSide:sp\)/.test(line));
    ok('3 runtime: the failing entry is reported (once), not swallowed', warnings.length === 1, page.logs.join(' | '));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
