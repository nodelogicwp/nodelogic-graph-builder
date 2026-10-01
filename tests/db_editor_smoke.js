/* Editor-side behavior of PRO Database nodes, against a fake admin REST API:
 * schema-driven dropdowns, the administrator signing flow (debounced, only on
 * real shape changes, never marking an unchanged page dirty), the
 * non-administrator lockout, and Insert/Update pin remapping when the chosen
 * column set changes (Trigger must stay Trigger).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data, x = 0, y = 0) => ({ id, name: id, type, x, y, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 120000);

// A connection lists every database its DB user can see; tables are fetched
// per database (only the usable ones), columns per database + table.
const SCHEMA = {
  connections: [{ id: 'wp', label: 'WordPress database', type: 'wp', status: 'ok', defaultDatabase: 'wp_site', databases: ['shop', 'wp_site'], error: '' }],
};
const TABLES = { wp_site: ['products', 'orders'], shop: ['items'] };
const COLUMNS = {
  'shop.items': [
    { name: 'id', type: 'int', nullable: false, key: 'PRI', autoIncrement: true },
    { name: 'title', type: 'varchar', nullable: true, key: '', autoIncrement: false },
  ],
  'wp_site.products': [
    { name: 'id', type: 'int', nullable: false, key: 'PRI', autoIncrement: true },
    { name: 'name', type: 'varchar', nullable: true, key: '', autoIncrement: false },
    { name: 'price', type: 'decimal', nullable: true, key: '', autoIncrement: false },
  ],
};

function mount(elements, connections, { canManage = true, viewport = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/wp-admin/post.php', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  // jsdom has no layout: give the canvas a real size so viewport culling
  // (and the per-node height math it runs during render) is exercised.
  if (viewport) {
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1400; } });
    Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 900; } });
  }
  const errors = [];
  w.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
  const origError = w.console.error;
  w.console.error = (...a) => { errors.push(a.map(String).join(' ')); };
  w.calcgraphProEditorConfig = { hasAccess: true, restUrl: 'https://editor.test/wp-json/calcgraph/v1/', restNonce: 'admin-nonce', canManageDatabase: canManage, dbAdminUrl: 'https://editor.test/wp-admin/admin.php?page=calcgraph-db-connections' };
  w.__opened = [];
  w.open = (url, target) => { w.__opened.push([url, target]); return null; };
  w.elementor = { config: { document: { id: 42 } } };
  const requests = [];
  w.fetch = async (url, opts = {}) => {
    const rec = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null };
    requests.push(rec);
    let body = {};
    if (rec.url.includes('db/editor-schema')) body = w.__schema || SCHEMA;
    else if (rec.url.includes('db/tables')) {
      const q = new URL(rec.url).searchParams;
      body = { ok: true, tables: q.get('connectionId') === 'wp' ? TABLES[q.get('database')] || [] : [] };
    } else if (rec.url.includes('db/columns')) {
      const q = new URL(rec.url).searchParams;
      body = { ok: true, columns: COLUMNS[`${q.get('database')}.${q.get('table')}`] || [] };
    } else if (rec.url.endsWith('db/sign')) body = { ok: true, signature: `nls1:sig-${requests.filter((r) => r.url.endsWith('db/sign')).length}` };
    return { ok: true, status: 200, json: async () => body };
  };
  const states = [];
  const formulas = [];
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: (state) => states.push(state), onFormulaChange: (formula) => formulas.push(formula),
  });
  const lastElement = (id) => {
    for (let i = states.length - 1; i >= 0; i--) {
      const found = (states[i].elements || []).find((el) => el.id === id);
      if (found) return found;
    }
    return null;
  };
  const lastConnections = () => (states.length ? states[states.length - 1].connections || [] : connections);
  const card = (id) => w.document.querySelector(`[data-element-id="${id}"]`);
  const signCalls = () => requests.filter((r) => r.url.endsWith('db/sign'));
  // Elementor mode (liveStateSync=false) only reports state on "Save graph".
  const save = async () => {
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(300);
  };
  return { w, errors, requests, states, formulas, lastElement, lastConnections, card, signCalls, save };
}

function setSelect(w, select, value) {
  const setter = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, value);
  select.dispatchEvent(new w.Event('change', { bubbles: true }));
}

(async () => {
  const baseEls = [
    mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'wp_site' }, -350, 0),
    mk('t', 'db-table', { dbTable: 'products' }, 0, 0),
    mk('f', 'db-filter', { dbFilterColumn: 'products.name', dbFilterOperator: 'eq', dbFilterValue: 'x' }, 350, 0),
    mk('sel', 'db-select', { dbLimit: 10, dbExecutePolicy: 'editors' }, 700, 0),
  ];
  const baseConns = [cn('c0', 'k', 'output0', 't', 'input0'), cn('c1', 't', 'output0', 'f', 'input0'), cn('c2', 'f', 'output0', 'sel', 'input0')];

  {
    const env = mount(baseEls, baseConns);
    await wait(1600);
    const connectCard = env.card('k');
    const connectSelects = connectCard ? Array.from(connectCard.querySelectorAll('select')) : [];
    ok('DB Connect shows the connection dropdown from the admin schema', connectSelects[0] && Array.from(connectSelects[0].options).some((o) => o.textContent === 'WordPress database'), connectCard && connectCard.textContent);
    ok('DB Connect lists EVERY database the connection can see', connectSelects[1] && Array.from(connectSelects[1].options).map((o) => o.value).join(',') === ',shop,wp_site' && /Database \(2 visible\)/.test(connectCard.textContent), connectCard && connectCard.textContent);
    ok('DB Connect never exposes credentials', !/password/i.test(JSON.stringify(env.requests.map((r) => r.body))) && !connectCard.querySelector('input[type="password"]') && !/"password"/i.test(JSON.stringify(SCHEMA)));
    const tableCard = env.card('t');
    const tableSelects = tableCard ? Array.from(tableCard.querySelectorAll('select')) : [];
    ok('DB Table only picks a table (connection comes from DB Connect)', tableSelects.length === 1 && /Table in wp_site/.test(tableCard.textContent), tableCard && tableCard.textContent);
    ok('DB Table lists only the USABLE tables of the chosen database', tableSelects[0] && Array.from(tableSelects[0].options).map((o) => o.value).join(',') === ',products,orders', tableSelects[0] && Array.from(tableSelects[0].options).map((o) => o.value).join(','));
    const urlHas = (part, params) => env.requests.some((r) => r.url.includes(part) && Object.entries(params).every(([k, v]) => new URL(r.url).searchParams.get(k) === v));
    ok('tables and columns are requested for the chosen database', urlHas('db/tables', { connectionId: 'wp', database: 'wp_site' }) && urlHas('db/columns', { connectionId: 'wp', database: 'wp_site', table: 'products' }), env.requests.map((r) => r.url).join(' | '));
    const filterSelect = env.card('f') && env.card('f').querySelector('select');
    ok('DB Filter column dropdown is built from live columns ("table.column")', filterSelect && Array.from(filterSelect.options).map((o) => o.value).includes('products.price'), filterSelect && Array.from(filterSelect.options).map((o) => o.value).join(','));
    ok('schema requests carry the admin REST nonce', env.requests.every((r) => r.headers['X-WP-Nonce'] === 'admin-nonce'));

    const first = env.signCalls();
    ok('the select op is signed once after load', first.length === 1, String(first.length));
    const signBody = first[0] ? first[0].body : {};
    ok('sign request binds page + block + node and sends the current graph', signBody.postId === 42 && signBody.editorId === 'e' && signBody.nodeId === 'sel' && Array.isArray(signBody.graph && signBody.graph.elements), JSON.stringify(signBody).slice(0, 200));
    await env.save();
    ok('the signature is stored on the op node', (env.lastElement('sel') || {}).data && env.lastElement('sel').data.dbSignature === 'nls1:sig-1', JSON.stringify(env.lastElement('sel')));

    await wait(1200);
    ok('no re-sign while nothing about the query changes', env.signCalls().length === 1, String(env.signCalls().length));

    const opSelect = Array.from(env.card('f').querySelectorAll('select'))[1];
    setSelect(env.w, opSelect, 'contains');
    const statesBefore = env.states.length;
    await env.save();
    ok('Save Graph is blocked while the new signature is still pending', env.states.length === statesBefore && /authorizing database nodes/.test(env.w.document.body.textContent), `${statesBefore} -> ${env.states.length}`);
    await wait(1400);
    ok('changing the filter operator triggers exactly one re-sign', env.signCalls().length === 2, String(env.signCalls().length));
    await env.save();
    ok('...and the new signature replaces the old one', env.lastElement('sel').data.dbSignature === 'nls1:sig-2');
    ok('the re-sign request carries the NEW operator in the graph', (env.signCalls()[1].body.graph.elements.find((e) => e.id === 'f') || {}).data.dbFilterOperator === 'contains');

    // Switching the database in DB Connect re-lists tables and re-signs.
    setSelect(env.w, Array.from(env.card('k').querySelectorAll('select'))[1], 'shop');
    await wait(1600);
    const shopTables = Array.from(env.card('t').querySelectorAll('select'))[0];
    ok('switching the database lists the tables of that database', shopTables && Array.from(shopTables.options).map((o) => o.value).join(',') === ',items' && /Table in shop/.test(env.card('t').textContent), env.card('t').textContent);
    const lastSign = env.signCalls()[env.signCalls().length - 1];
    ok('switching the database re-signs (the connect node is part of the signed chain)', env.signCalls().length === 3 && (lastSign.body.graph.elements.find((e) => e.id === 'k') || {}).data.dbDatabase === 'shop', String(env.signCalls().length));
  }

  {
    // Regression: DB Fields -> Select with a resolved table. Node heights are
    // computed during render (viewport culling) and read the column cache;
    // that helper used to be declared after the memo -> TDZ crash
    // ("Cannot access 'eo' before initialization") that blanked the editor.
    const env = mount([
      mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'wp_site' }, 0, 0),
      mk('t', 'db-table', { dbTable: 'products' }, 320, 0),
      mk('fl', 'db-fields', { dbFields: ['name', 'price'] }, 640, 0),
      mk('sel', 'db-select', { dbLimit: 5 }, 960, 0),
    ], [cn('c0', 'k', 'output0', 't', 'input0'), cn('c1', 't', 'output0', 'fl', 'input0'), cn('c2', 'fl', 'output0', 'sel', 'input0')], { viewport: true });
    await wait(1600);
    const tdz = env.errors.filter((e) => /before initialization|is not defined|Cannot access/.test(e));
    ok('Fields -> Select with a live table renders without a TDZ crash', tdz.length === 0 && !!env.card('sel') && !!env.card('fl'), tdz.join(' | ').slice(0, 300));
    const checks = env.card('fl') ? Array.from(env.card('fl').querySelectorAll('input[type="checkbox"]')) : [];
    ok('DB Fields lists the live columns inside the visible canvas', checks.length === 3, String(checks.length));
  }

  {
    // A database created in the hosting panel after the editor loaded:
    // "+ Add database..." opens the admin page; Refresh re-reads the schema
    // with ?refresh=1 (server drops its cache) and the new database appears.
    const env = mount([mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'wp_site' }, 0, 0)], [], { viewport: true });
    await wait(1200);
    const btn = (action) => env.card('k').querySelector(`button[data-db-action="${action}"]`);
    ok('DB Connect offers "+ Add database..." and Refresh', !!btn('add-connection') && !!btn('refresh'), env.card('k').textContent);
    btn('add-connection').click();
    ok('"+ Add database..." opens NodeLogic > Database in a new tab', env.w.__opened.length === 1 && /page=calcgraph-db-connections/.test(env.w.__opened[0][0]) && env.w.__opened[0][1] === '_blank', JSON.stringify(env.w.__opened));
    env.w.__schema = { connections: [
      SCHEMA.connections[0],
      { id: 'c_00000000000000aa', label: 'Hostinger shop DB', type: 'external', status: 'ok', defaultDatabase: 'u123_shop', databases: ['u123_shop'], error: '' },
    ] };
    btn('refresh').click();
    await wait(800);
    ok('Refresh re-reads the schema with ?refresh=1', env.requests.some((r) => /db\/editor-schema\?refresh=1$/.test(r.url)), env.requests.map((r) => r.url).join(' | '));
    const connSelect = env.card('k').querySelectorAll('select')[0];
    ok('the newly added connection is offered after Refresh', connSelect && Array.from(connSelect.options).some((o) => o.value === 'c_00000000000000aa'), connSelect && Array.from(connSelect.options).map((o) => o.textContent).join(','));
    setSelect(env.w, connSelect, 'c_00000000000000aa');
    await wait(300);
    const dbSelect = env.card('k').querySelectorAll('select')[1];
    ok('choosing it preselects its database', dbSelect && dbSelect.value === 'u123_shop', dbSelect && dbSelect.value);
  }

  {
    // DB Table with nothing on its Connection pin explains what is missing.
    const env = mount([mk('t', 'db-table', { dbTable: 'products' }, 0, 0), mk('sel', 'db-select', {}, 350, 0)], [cn('c1', 't', 'output0', 'sel', 'input0')]);
    await wait(1600);
    ok('DB Table without DB Connect asks for one', /Connect a DB Connect node/.test(env.card('t').textContent) && env.card('t').querySelectorAll('select').length === 0, env.card('t').textContent);
  }

  {
    const env = mount(baseEls, baseConns, { canManage: false });
    await wait(1600);
    ok('non-administrator: no schema or sign request is ever made', env.requests.length === 0, env.requests.map((r) => r.url).join(','));
    ok('non-administrator: node explains the lockout', /Only administrators/.test(env.card('t').textContent), env.card('t').textContent);
  }

  {
    // Insert with columns [name, price] -> pins: 0 Query, 1 name, 2 price, 3 Trigger.
    const insEls = [
      mk('k', 'db-connect', { dbConnectionId: 'wp', dbDatabase: 'wp_site' }, -350, 0),
      mk('t', 'db-table', { dbTable: 'products' }, 0, 0),
      mk('a', 'constant-string', { value: 'A' }, 0, 200),
      mk('p', 'number', { value: 3 }, 0, 300),
      mk('ev', 'event-element', { eventUseManualId: true, eventId: 'btn' }, 0, 400),
      mk('ins', 'db-insert', { dbColumns: ['name', 'price'], dbExecutePolicy: 'editors' }, 400, 0),
    ];
    const insConns = [
      cn('c0', 'k', 'output0', 't', 'input0'),
      cn('c1', 't', 'output0', 'ins', 'input0'),
      cn('c2', 'a', 'output0', 'ins', 'input1'),
      cn('c3', 'p', 'output0', 'ins', 'input2'),
      cn('c4', 'ev', 'output0', 'ins', 'input3'),
    ];
    const env = mount(insEls, insConns);
    await wait(1600);
    const labels = () => Array.from(env.card('ins').querySelectorAll('.input-label')).map((l) => l.textContent);
    await env.save(); // Insert is a side-effect root: compiled without an Output
    const formula = env.formulas[env.formulas.length - 1] || '';
    ok('DB Table compiles with the DB Connect chain as its connection', /__nodeDbChain\("t",\s*__nodeDbChain\("k"/.test(formula), formula.slice(0, 300));
    ok('Insert shows one labeled pin per column + Trigger', labels().join(',') === 'Query,name,price,Trigger', labels().join(','));
    // Uncheck "name" in the column checklist.
    const nameBox = Array.from(env.card('ins').querySelectorAll('label.reverse-toggle')).find((l) => l.textContent.trim() === 'name');
    nameBox.querySelector('input').click();
    // The column change alters the signed shape: let the re-sign finish
    // before saving (a save during it is -- correctly -- blocked).
    await wait(1500);
    await env.save();
    const conns = env.lastConnections().filter((c) => c.toId === 'ins');
    const byFrom = Object.fromEntries(conns.map((c) => [c.fromId, c.toInput]));
    ok('after removing a column: its wire is dropped', !('a' in byFrom), JSON.stringify(byFrom));
    ok('...price moves to its new pin index', byFrom.p === 'input1', JSON.stringify(byFrom));
    ok('...and the Trigger wire stays on the Trigger pin', byFrom.ev === 'input2', JSON.stringify(byFrom));
    ok('pin labels follow the new column set', labels().join(',') === 'Query,price,Trigger', labels().join(','));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
