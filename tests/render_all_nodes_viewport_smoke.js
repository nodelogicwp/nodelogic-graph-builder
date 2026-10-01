/* Every palette node type (LITE treeData + PRO palette) mounted at once in a
 * canvas with a REAL size. jsdom has no layout, so without the size stub the
 * viewport-culling memo returns early and never runs the per-node height
 * math during render -- which is exactly where a helper used before its
 * declaration crashed the whole editor ("Cannot access 'eo' before
 * initialization" on DB Fields -> DB Select). Also runs a fully wired DB
 * chain, since several height/config paths only activate with a table.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const PRO_PALETTE = path.resolve(ROOT, '..', 'nodelogic-graph-builder-pro', 'includes', 'js', 'pro-editor-config.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 90000);

const source = fs.readFileSync(path.join(ROOT, 'src', 'components', 'graphEditor', 'treeData.ts'), 'utf8')
  + (fs.existsSync(PRO_PALETTE) ? fs.readFileSync(PRO_PALETTE, 'utf8') : '');
const TYPES = [...new Set([...source.matchAll(/type:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]))].filter((t) => t !== 'folder');

const mk = (id, type, data, x = 0, y = 0) => ({ id, name: id, type, x, y, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });

function mount(elements, connections) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/wp-admin/post.php', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1600; } });
  Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 1000; } });
  const errors = [];
  w.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
  w.console.error = (...a) => errors.push(a.map(String).join(' '));
  w.calcgraphProEditorConfig = { hasAccess: true, restUrl: 'https://editor.test/wp-json/calcgraph/v1/', restNonce: 'n', canManageDatabase: true, dbAdminUrl: 'https://editor.test/wp-admin/admin.php?page=calcgraph-db-connections' };
  w.elementor = { config: { document: { id: 42 } } };
  w.fetch = async (url) => {
    const u = String(url);
    let body = {};
    if (u.includes('db/editor-schema')) body = { connections: [{ id: 'wp', label: 'WordPress database', type: 'wp', status: 'ok', defaultDatabase: 'wp_site', databases: ['wp_site'], error: '' }] };
    else if (u.includes('db/tables')) body = { ok: true, tables: ['products', 'orders'] };
    else if (u.includes('db/columns')) body = { ok: true, columns: [{ name: 'id', type: 'int', nullable: false, key: 'PRI', autoIncrement: true }, { name: 'name', type: 'varchar', nullable: true, key: '', autoIncrement: false }, { name: 'product_id', type: 'int', nullable: true, key: '', autoIncrement: false }] };
    else if (u.includes('db/sign')) body = { ok: true, signature: 'nls1:x' };
    return { ok: true, status: 200, json: async () => body };
  };
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: () => {}, onFormulaChange: () => {},
  });
  return { w, errors, cards: () => w.document.querySelectorAll('[data-element-id]').length };
}
const crashes = (errors) => errors.filter((e) => /before initialization|is not defined|is not a function|Cannot read prop|Maximum update depth|The above error occurred/i.test(e));

(async () => {
  ok('palette types were collected (LITE + PRO)', TYPES.length > 100 && TYPES.includes('db-connect') && TYPES.includes('send-email'), String(TYPES.length));

  {
    // Every node on screen at once (overlap is fine: culling keeps them all).
    const elements = TYPES.map((type, i) => mk(`n${i}`, type, {}, (i % 12) * 110, Math.floor(i / 12) * 60));
    const env = mount(elements, []);
    await wait(1500);
    const bad = crashes(env.errors);
    ok(`all ${TYPES.length} node types render in a real-sized viewport without a render error`, bad.length === 0, bad.join(' | ').slice(0, 400));
    ok('the editor is still mounted (not blanked by an error)', env.cards() > 0, String(env.cards()));
  }

  {
    // An Unzip on the first output of every node type: Unzip pin counts
    // resolve the source's schema during render.
    const elements = [];
    const conns = [];
    TYPES.forEach((type, i) => {
      elements.push(mk(`s${i}`, type, {}, (i % 12) * 110, Math.floor(i / 12) * 60));
      elements.push(mk(`u${i}`, 'unzip', {}, (i % 12) * 110 + 50, Math.floor(i / 12) * 60 + 20));
      conns.push(cn(`w${i}`, `s${i}`, 'output0', `u${i}`, 'input0'));
    });
    const env = mount(elements, conns);
    await wait(1500);
    const bad = crashes(env.errors);
    ok('an Unzip wired to every node type renders without a render error', bad.length === 0, bad.join(' | ').slice(0, 400));
  }

  {
    // Fully wired DB chain: every DB node with a resolved database + table.
    const els = [
      mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'wp_site' }, 0, 0),
      mk('t', 'db-table', { dbTable: 'products' }, 300, 0),
      mk('fl', 'db-fields', { dbFields: ['id', 'name'] }, 600, 0),
      mk('j', 'db-join', { dbJoinType: 'inner', dbJoinTable: 'orders', dbJoinLeftColumn: 'products.id', dbJoinRightColumn: 'product_id' }, 900, 0),
      mk('f', 'db-filter', { dbFilterColumn: 'products.name', dbFilterOperator: 'eq', dbFilterValue: 'x' }, 1200, 0),
      mk('so', 'db-sort', { dbSortColumn: 'products.id', dbSortDirection: 'asc' }, 0, 300),
      mk('sel', 'db-select', {}, 300, 300),
      mk('t2', 'db-table', { dbTable: 'products' }, 600, 300),
      mk('ins', 'db-insert', { dbColumns: ['name'] }, 900, 300),
      mk('upd', 'db-update', { dbColumns: ['name'] }, 1200, 300),
      mk('del', 'db-delete', {}, 0, 600),
      mk('f2', 'db-filter', { dbFilterColumn: 'products.id', dbFilterOperator: 'eq', dbFilterValue: '1' }, 300, 600),
      // Unzip of DB Select's First Row / Rows (pin counts come from the live
      // column schema -- the second live TDZ crash).
      mk('uz1', 'unzip', {}, 600, 600),
      mk('uz2', 'unzip', {}, 900, 600),
    ];
    const conns = [
      cn('a', 'k', 'output0', 't', 'input0'), cn('b', 't', 'output0', 'fl', 'input0'), cn('c', 'fl', 'output0', 'j', 'input0'),
      cn('d', 'j', 'output0', 'f', 'input0'), cn('e', 'f', 'output0', 'so', 'input0'), cn('g', 'so', 'output0', 'sel', 'input0'),
      cn('h', 'k', 'output0', 't2', 'input0'), cn('i', 't2', 'output0', 'ins', 'input0'), cn('l', 't2', 'output0', 'f2', 'input0'),
      cn('m', 'f2', 'output0', 'upd', 'input0'), cn('o', 'f2', 'output0', 'del', 'input0'),
      cn('p', 'sel', 'output1', 'uz1', 'input0'), cn('q', 'sel', 'output0', 'uz2', 'input0'),
    ];
    const env = mount(els, conns);
    await wait(1800);
    const bad = crashes(env.errors);
    ok('a fully wired DB chain (connect/table/fields/join/filter/sort/select/insert/update/delete) renders without a render error', bad.length === 0, bad.join(' | ').slice(0, 400));
    const missing = els.filter((el) => !env.w.document.querySelector(`[data-element-id="${el.id}"]`)).map((el) => el.id);
    ok('every DB node card is on the canvas', missing.length === 0, missing.join(','));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
