/* Free DOM nodes: Raw HTML Element, Set Parent, Clone Element, Elements by
 * Class -- plus the Output "element as value" mount, the sanitizer (Raw HTML
 * and the Set HTML action) and the editor integration.
 *
 *   model   : tests/rawHtmlModel.cjs (built by tests/run.js)
 *   editor  : real dist/build/elementor.js
 *   runtime : real frontend.js
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
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail} failed (incomplete)`); process.exit(1); }, 240000);

// ---------------------------------------------------------------- harness
const modelWindow = new JSDOM('<!doctype html><body></body>').window;
global.DOMParser = modelWindow.DOMParser;
global.document = modelWindow.document;
const MODEL = require('./rawHtmlModel.cjs');

function editorWindow({ viewport = true } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  if (viewport) {
    Object.defineProperty(w.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1600; } });
    Object.defineProperty(w.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 1000; } });
  }
  const errors = [];
  w.addEventListener('error', (e) => errors.push(String(e.message || e.error)));
  w.console.error = (...a) => errors.push(a.map(String).join(' '));
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return { w, errors };
}
async function editor(elements, connections) {
  const { w, errors } = editorWindow();
  const formulas = [], states = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
    onStateChange: (st) => states.push(st), onFormulaChange: (f) => formulas.push(f),
  });
  await wait(700);
  const save = async () => {
    const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
    if (b) b.click();
    await wait(300);
  };
  await save();
  const card = (id) => w.document.querySelector(`[data-element-id="${id}"]`);
  return { w, errors, save, card, formula: () => formulas[formulas.length - 1] || '', state: () => states[states.length - 1] };
}
function runtime(formula, bodyHtml) {
  const dom = new JSDOM(`<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e" data-post-id="1" data-output-configs="{}" style="display:none"></div></body>`,
  { runScripts: 'dangerously', url: 'https://s.test/page', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafs = 0;
  w.requestAnimationFrame = (cb) => { rafs++; return setTimeout(() => cb(0), 0); };
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  w.document.getElementById('lb').setAttribute('data-formula', formula || '');
  const errs = []; w.console.error = (...a) => errs.push(a.map(String).join(' '));
  // expose internals for direct checks
  let src = FRONT; const m = '\n})();'; const k = src.lastIndexOf(m);
  src = src.slice(0, k) + '\n;window.__H={ nlSanitizeHtmlString, safeEvaluateExpression, isPreparedExpressionSafe, recalc: scheduleRecalculation };' + src.slice(k);
  const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return { w, doc: w.document, errs, rafs: () => rafs, H: w.__H };
}
// A REAL recalculation (frontend.js has no resize listener).
const recalc = async (w, ms = 120) => { w.__H.recalc(); await wait(ms); };
const crashes = (errs) => errs.filter((e) => /Cannot read|is not a function|SyntaxError|before initialization|not defined/i.test(e));

(async () => {
  // =========================================================== MODEL
  const clean = (html) => {
    const doc = new modelWindow.DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
    const removed = MODEL.sanitizeRawHtmlTree(doc.body);
    return { html: doc.body.innerHTML, removed };
  };
  const CORPUS = [
    '<div onclick="alert(1)" class="a">x</div>',
    '<script>alert(1)</script><p>ok</p>',
    '<a href="javascript:alert(1)">j</a><a href=" JaVa\tScRiPt:alert(1)">j2</a><a href="https://ok.test" target="_blank">k</a>',
    '<img src="data:image/png;base64,AAAA" alt="p"><img src="data:text/html;base64,PHNjcmlwdD4=">',
    '<iframe src="https://www.youtube.com/embed/abc"></iframe><iframe src="https://evil.test/x"></iframe><iframe src="https://www.google.com/maps/embed?pb=1"></iframe><iframe src="https://www.google.com/search"></iframe>',
    '<svg onload="alert(1)" viewBox="0 0 10 10"><use href="https://evil.test/x.svg#a"></use><use href="#ok"></use><animate attributeName="href" values="javascript:alert(1)"></animate><circle r="4" fill="red"></circle></svg>',
    '<p style="background:url(javascript:alert(1))">s</p><p style="color: red">t</p>',
    '<style>body{display:none}</style><my-widget><b>inner</b></my-widget>',
    '<div data-nodelogic-logic="1" data-formula="x" data-ok="1" aria-label="l">d</div>',
    '<form action="javascript:alert(1)"><input type="text" name="n" onfocus="alert(1)" autofocus></form>',
    '<img srcset="https://a.test/1.png 1x, javascript:alert(1) 2x">',
    '<!-- comment --><object data="x"></object><embed src="x"><meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  ];
  {
    const all = CORPUS.map((html) => clean(html).html).join('\n');
    ok('M sanitizer: no script / handler / javascript: survives', !/<script|onclick|onload|onfocus|javascript:/i.test(all), all);
    ok('M sanitizer: safe content survives (text, https link, class, aria/data-*)', /class="a">x</.test(all) && /href="https:\/\/ok\.test"/.test(all) && /aria-label="l"/.test(all) && /data-ok="1"/.test(all), all);
    ok('M sanitizer: target=_blank gets rel=noopener', /target="_blank" rel="noopener noreferrer"/.test(all));
    ok('M sanitizer: data:image allowed on <img>, data:text/html is not', /src="data:image\/png/.test(all) && !/data:text\/html/.test(all));
    ok('M sanitizer: iframes only for YouTube / Google Maps embed', (all.match(/<iframe/g) || []).length === 2 && /youtube\.com\/embed/.test(all) && /maps\/embed/.test(all) && !/evil\.test\/x"/.test(all) && !/google\.com\/search/.test(all));
    ok('M sanitizer: SVG <use> only for #fragments, <animate> dropped, drawing kept', /<use href="#ok">/.test(all) && !/evil\.test\/x\.svg/.test(all) && !/animate/i.test(all) && /<circle r="4" fill="red">/.test(all));
    ok('M sanitizer: unsafe inline style dropped, safe style kept', !/url\(javascript/i.test(all) && /style="color: red"/.test(all));
    ok('M sanitizer: <style> removed, unknown element unwrapped (content kept)', !/<style|display:none|my-widget/i.test(all) && /<b>inner<\/b>/.test(all));
    ok('M sanitizer: NodeLogic runtime attributes cannot be injected', !/data-nodelogic-logic|data-formula/.test(all));
    ok('M sanitizer: unsafe srcset dropped, comments / object / embed / meta removed', !/srcset/.test(all) && !/comment|<object|<embed|<meta/.test(all));
    ok('M sanitizer: removals are reported for the editor hint', clean(CORPUS[0]).removed.includes('onclick handler') && clean(CORPUS[1]).removed.includes('<script>'), JSON.stringify(clean(CORPUS[0]).removed));

    const analysis = MODEL.analyzeRawHtml('<div class="card" style="color: red; padding: 4px"><h2 id="t">Title</h2><a href="https://x.test">Go</a><img src="https://x.test/i.png" alt="pic"><input type="checkbox" checked></div>', modelWindow.document);
    const ids = analysis.slots.map((s) => s.id);
    ok('M slots: text / attributes / inline styles detected in document order',
      JSON.stringify(ids) === JSON.stringify(['div.card|attr:class', 'div.card|style:color', 'div.card|style:padding', 'div.card/h2#t|text', 'div.card/h2#t|attr:id', 'div.card/a|text', 'div.card/a|attr:href', 'div.card/img|attr:src', 'div.card/img|attr:alt', 'div.card/input|attr:type', 'div.card/input|attr:checked']), JSON.stringify(ids));
    const byId = Object.fromEntries(analysis.slots.map((s) => [s.id, s]));
    ok('M slots: types (color style -> color, boolean attr -> boolean)', byId['div.card|style:color'].type === 'color' && byId['div.card/input|attr:checked'].type === 'boolean' && byId['div.card/h2#t|text'].type === 'string');
    ok('M slots: readable labels', byId['div.card/h2#t|text'].label === 'h2#t Text' && byId['div.card|style:color'].label === 'div.card color' && byId['div.card/a|attr:href'].label === 'a href' && byId['div.card/a|attr:href'].path.join('.') === '1', JSON.stringify(analysis.slots.map((s) => s.label)));
    ok('M slots: containers have no Text slot (would wipe children), voids neither', !ids.includes('div.card|text') && !ids.includes('div.card/img|text'));
    const multi = MODEL.analyzeRawHtml('<span>a</span><span>b</span>', modelWindow.document);
    ok('M root: several top-level elements are wrapped in one <div>', multi.root.tagName === 'DIV' && multi.root.children.length === 2 && multi.slots.map((s) => s.id).join(',') === 'div/span|text,div/span(2)|text');
    ok('M root: a single top-level element is the root itself', MODEL.analyzeRawHtml('  <section><p>x</p></section>  ', modelWindow.document).root.tagName === 'SECTION');
  }

  // =========================================================== RUNTIME: sanitizer parity + Set HTML
  {
    const rt = runtime('', '<div id="x"></div>');
    const mismatches = CORPUS.filter((html) => rt.H.nlSanitizeHtmlString(html) !== clean(html).html);
    ok('R runtime sanitizer == editor sanitizer on the whole corpus', mismatches.length === 0, mismatches.map((h) => `${h}\n  rt: ${rt.H.nlSanitizeHtmlString(h)}\n  ed: ${clean(h).html}`).join('\n'));
    const big = `__nodeToString(${JSON.stringify('<p>' + 'x'.repeat(30000) + '</p>')})`;
    ok('R a long HTML string literal no longer trips the 12000-char formula cap', rt.H.isPreparedExpressionSafe(big) === true);
    ok('R ...but the CODE part is still capped', rt.H.isPreparedExpressionSafe(Array(3000).fill('__nodeToNumber(1)').join(' + ')) === false);
  }
  {
    const g = [
      mk('ref', 'element-ref', { elementUseManualId: true, customElementId: 'target' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('sh', 'action-set-html', {}),
      mk('val', 'constant-string', { value: '<b>bold</b><img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>' }),
    ];
    const c = [cn('a', 'ref', 'output0', 'out', 'input0'), cn('b', 'out', 'output0', 'sh', 'input0'), cn('d', 'val', 'output0', 'sh', 'input1')];
    const ed = await editor(g, c);
    const rt = runtime(ed.formula(), '<div id="target">old</div>');
    await wait(150);
    const html = rt.doc.getElementById('target').innerHTML;
    ok('R Set HTML action: markup applied', /<b>bold<\/b>/.test(html), html + ' | ' + ed.formula());
    ok('R Set HTML action: script / onerror stripped (was an XSS hole)', !/onerror|<script/.test(html) && rt.w.__pwned === undefined, html);
  }

  // =========================================================== E2E: Raw HTML -> Output (value), Element Property
  {
    const html = '<div class="card" style="color: red"><h3>Title</h3><a href="https://x.test">Go</a><p>body</p><script>window.__pwned=1</script></div>';
    const g = [
      mk('raw', 'raw-html', { rawHtml: html, rawHtmlSlots: ['div.card/h3|text', 'div.card|style:color', 'div.card/a|attr:href'] }),
      mk('title', 'constant-string', { value: 'Hello <b>not html</b>' }),
      mk('col', 'color', { colorValue: '#00ff00' }),
      mk('link', 'constant-string', { value: 'javascript:alert(1)' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('ref', 'element-ref', { elementUseManualId: true, customElementId: 'sink' }),
      mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
      mk('out2', 'output', { outputTargetElementPin: true }),
      mk('ref2', 'element-ref', { elementUseManualId: true, customElementId: 'sink2' }),
    ];
    const c = [
      // Pins follow DOCUMENT order: div color, h3 text, a href.
      cn('c1', 'col', 'output0', 'raw', 'input0'),
      cn('c2', 'title', 'output0', 'raw', 'input1'),
      cn('c3', 'link', 'output0', 'raw', 'input2'),
      cn('c4', 'ref', 'output0', 'out', 'input0'),
      cn('c5', 'raw', 'output0', 'out', 'input1'),
      cn('c6', 'raw', 'output0', 'prop', 'input0'),
      cn('c7', 'ref2', 'output0', 'out2', 'input0'),
      cn('c8', 'prop', 'output0', 'out2', 'input1'),
    ];
    const ed = await editor(g, c);
    const saved = ed.state();
    ok('E Output value pin accepts an element (Raw HTML wire kept on save)', !!saved && saved.connections.some((x) => x.fromId === 'raw' && x.toId === 'out' && x.toInput === 'input1'), JSON.stringify(saved && saved.connections));
    ok('E Raw HTML pins follow the checked slots', saved && saved.connections.filter((x) => x.toId === 'raw').map((x) => x.toInput).sort().join(',') === 'input0,input1,input2');
    const f = ed.formula();
    ok('E compiles to __nodeRawHtml with slot specs', /__nodeRawHtml\("raw", /.test(f) && f.includes('["0", "text", ""]') && f.includes('["", "style", "color"]'), f.slice(0, 400));
    ok('E no DOM node / script in the saved graph JSON', !/nodeType|ownerDocument|\[object HTML/.test(JSON.stringify(saved)));

    const rt = runtime(f, '<div id="sink">OLD</div><div id="sink2">-</div>');
    await wait(200);
    const sink = rt.doc.getElementById('sink');
    const card = sink.querySelector('.card');
    ok('R Output mounts the Raw HTML element inside the target', !!card && sink.children.length === 1 && !/OLD/.test(sink.textContent), sink.innerHTML);
    ok('R slot values applied: text (as TEXT, not HTML), style color', card && card.querySelector('h3').textContent === 'Hello <b>not html</b>' && !card.querySelector('h3 b') && /color: (rgb\(0, 255, 0\)|#00ff00)/.test(card.getAttribute('style')), card && card.outerHTML);
    ok('R a javascript: value on an href pin is refused (original kept)', card && card.querySelector('a').getAttribute('href') === 'https://x.test', card && card.outerHTML);
    ok('R the HTML itself was sanitized (script gone, never ran)', card && !card.querySelector('script') && rt.w.__pwned === undefined);
    ok('R Element Property reads the Raw HTML element (textContent)', /Hello <b>not html<\/b>GobodyS?/.test(rt.doc.getElementById('sink2').textContent) || rt.doc.getElementById('sink2').textContent.startsWith('Hello'), rt.doc.getElementById('sink2').textContent);
    let mutations = 0;
    new rt.w.MutationObserver((list) => { mutations += list.length; }).observe(sink, { childList: true });
    await recalc(rt.w);
    await recalc(rt.w);
    ok('R re-evaluation keeps the SAME element (no re-create / re-mount churn)', sink.querySelector('.card') === card && mutations === 0, `mutations=${mutations}`);
    ok('R no runtime errors', crashes(rt.errs).length === 0, rt.errs.join(' | '));
  }

  // =========================================================== EDITOR: Raw HTML node UI
  {
    const ed = await editor([mk('raw', 'raw-html', { rawHtml: '<div class="c"><h3>T</h3><p style="color: red">P</p></div>', rawHtmlSlots: ['div.c/h3|text', 'div.c/p|style:color'] }), mk('s1', 'constant-string', { value: 'a' }), mk('s2', 'color', { colorValue: '#fff' })],
      [cn('w1', 's1', 'output0', 'raw', 'input0'), cn('w2', 's2', 'output0', 'raw', 'input1')]);
    const card = ed.card('raw');
    const boxes = card ? Array.from(card.querySelectorAll('[data-raw-html-slots] input[type="checkbox"]')) : [];
    ok('E checklist lists every detected slot', boxes.map((b) => b.dataset.slotId).join(',') === 'div.c|attr:class,div.c/h3|text,div.c/p|text,div.c/p|style:color', boxes.map((b) => b.dataset.slotId).join(','));
    ok('E pin labels come from the structure', Array.from(card.querySelectorAll('.input-label')).map((l) => l.textContent).join(',') === 'h3 Text,p color', Array.from(card.querySelectorAll('.input-label')).map((l) => l.textContent).join(','));
    ok('E the node shows an "Edit HTML" button, not an inline editor', !!card.querySelector('button[data-raw-html-open]') && !card.querySelector('textarea'), card.innerHTML.slice(0, 200));
    const setter = Object.getOwnPropertyDescriptor(ed.w.HTMLTextAreaElement.prototype, 'value').set;
    const modal = () => ed.w.document.querySelector('[data-raw-html-modal]');
    const type = async (text) => {
      const area = modal().querySelector('textarea[data-raw-html-editor]');
      setter.call(area, text);
      area.dispatchEvent(new ed.w.Event('input', { bubbles: true }));
      await wait(150);
    };
    const done = async () => {
      Array.from(modal().querySelectorAll('button')).find((b) => b.textContent === 'Done').click();
      await wait(300);
    };
    ed.card('raw').querySelector('button[data-raw-html-open]').click();
    await wait(150);
    ok('E "Edit HTML" opens the HTML Editor modal with the current HTML', !!modal() && modal().querySelector('textarea').value.includes('<h3>T</h3>') && /HTML Editor/.test(modal().textContent));
    // Remove the <h3>: while typing nothing changes; on Done its slot
    // disappears and the p/color wire follows its slot.
    await type('<div class="c"><p');
    ok('E typing in the modal does not touch the node until Done (no wires lost mid-edit)', ed.w.document.querySelectorAll('[data-element-id="raw"] .input-label').length === 2);
    await type('<div class="c"><p style="color: red">P</p></div>');
    await done();
    ok('E Done closes the modal', !modal());
    await ed.save();
    const conns = ed.state().connections.filter((x) => x.toId === 'raw');
    ok('E editing the HTML: the vanished slot drops its wire, the others are remapped', conns.length === 1 && conns[0].fromId === 's2' && conns[0].toInput === 'input0', JSON.stringify(conns));
    ed.card('raw').querySelector('button[data-raw-html-open]').click();
    await wait(150);
    await type('<div><script>x()</script><b onclick="y()">b</b></div>');
    ok('E the modal previews what will be removed for safety', /Removed for safety: <script>, onclick handler/.test(modal().textContent), modal().textContent);
    ed.w.document.querySelector('[data-raw-html-modal]').click(); // backdrop: keeps the edit, like CSS Custom
    await wait(300);
    ok('E closing via the backdrop keeps the edit; node hint names what was stripped', !modal() && /Removed for safety: <script>, onclick handler/.test(ed.card('raw').textContent), ed.card('raw').textContent);
    ok('E editor: no render errors', crashes(ed.errors).length === 0, ed.errors.join(' | ').slice(0, 300));
  }
  {
    // Element Property / Get Children detect the Raw HTML structure in the editor.
    const ed = await editor([
      mk('raw', 'raw-html', { rawHtml: '<ul class="menu"><li>One</li><li>Two</li><li id="x">Three</li></ul>', rawHtmlSlots: [] }),
      mk('prop', 'element-property', { elementPropertyMode: 'single' }),
      mk('gc', 'get-children', { getChildrenMode: 'single' }),
    ], [cn('a', 'raw', 'output0', 'prop', 'input0'), cn('b', 'raw', 'output0', 'gc', 'input0')]);
    await wait(500);
    const propOptions = Array.from(ed.card('prop').querySelectorAll('select option')).map((o) => o.value);
    ok('E Element Property fed by Raw HTML offers the element\'s real properties', propOptions.includes('textContent') && propOptions.includes('className'), propOptions.join(','));
    const childOptions = Array.from(ed.card('gc').querySelectorAll('select option')).map((o) => o.textContent);
    ok('E Get Children fed by Raw HTML detects its children', childOptions.some((t) => /0: li/.test(t)) && childOptions.some((t) => /2: li#x/.test(t)), childOptions.join(','));
  }

  // =========================================================== EDITOR: Element pin only (Element Property / Get Children)
  {
    // A legacy graph: both nodes used their own (now removed) ID controls.
    const ed = await editor([
      mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent', elementUseManualId: true, customElementId: 'target' }, 400, 0),
      mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children', selectedElement: 'list' }, 400, 200),
      mk('gc2', 'get-children', { selectedElement: 'x' }, 400, 400),
      mk('r', 'element-ref', { elementUseManualId: true, customElementId: 'y' }, 0, 400),
      Object.assign(mk('css', 'css-text', { cssText: 'color: red' }, 0, 600), { name: 'CSS Text' }),
      mk('out', 'output', { outputTargetElementPin: true }, 800, 0),
      mk('ref', 'element-ref', { elementUseManualId: true, customElementId: 'sink' }, 600, 0),
      mk('len', 'array-length', {}, 600, 200),
      mk('out2', 'output', { outputTargetElementPin: true }, 800, 200),
      mk('ref2', 'element-ref', { elementUseManualId: true, customElementId: 'sink2' }, 600, 300),
    ], [
      cn('a', 'ref', 'output0', 'out', 'input0'), cn('b', 'prop', 'output0', 'out', 'input1'),
      cn('c', 'gc', 'output0', 'len', 'input0'), cn('d', 'ref2', 'output0', 'out2', 'input0'), cn('e', 'len', 'output0', 'out2', 'input1'),
      cn('f', 'r', 'output0', 'gc2', 'input0'),
    ]);
    const st = ed.state();
    const refFor = (id) => {
      const wire = st.connections.find((c) => c.toId === id && c.toInput === 'input0');
      return wire ? st.elements.find((e) => e.id === wire.fromId) : null;
    };
    const pr = refFor('prop');
    const gr = refFor('gc');
    ok('M legacy ID on Element Property -> an Element Reference with the same id, wired to its pin', pr && pr.type === 'element-ref' && pr.data.elementUseManualId === true && pr.data.customElementId === 'target', JSON.stringify(pr));
    ok('M legacy dropdown ID on Get Children -> an Element Reference too', gr && gr.type === 'element-ref' && gr.data.selectedElement === 'list', JSON.stringify(gr));
    ok('M an already wired pin keeps its source; the stale ID is just dropped', refFor('gc2') && refFor('gc2').id === 'r' && !('selectedElement' in st.elements.find((e) => e.id === 'gc2').data));
    ok('M legacy ID fields are gone from both nodes', ['prop', 'gc'].every((id) => { const d = st.elements.find((e) => e.id === id).data; return !('customElementId' in d) && !('selectedElement' in d) && !('elementUseManualId' in d); }));
    ok('M "CSS Text" nodes are renamed "CSS Custom"', st.elements.find((e) => e.id === 'css').name === 'CSS Custom');
    const f = ed.formula();
    ok('M the migrated graph compiles to the same element lookups', /__nodeGetElementProp\(__nodeGetElement\("target"\), "textContent"\)/.test(f) && /__nodeGetChildren\(__nodeGetElement\("list"\)\)/.test(f), f.slice(0, 400));
    const rt = runtime(f, '<div id="target">hello</div><ul id="list"><li>1</li><li>2</li></ul><div id="sink">-</div><div id="sink2">-</div>');
    await wait(200);
    ok('M ...and behaves as before at runtime', rt.doc.getElementById('sink').textContent === 'hello' && rt.doc.getElementById('sink2').textContent === '2', rt.doc.body.innerHTML);
    const ed2 = await editor([mk('prop', 'element-property', {}), mk('gc', 'get-children', {})], []);
    const pc = ed2.card('prop');
    const gcCard = ed2.card('gc');
    ok('E Element Property: no Element ID input / dropdown / Manual ID any more', pc && !pc.querySelector('input, select') && !/Manual ID/.test(pc.textContent) && /connect an element to the Element pin/.test(pc.textContent), pc && pc.textContent);
    ok('E Get Children: nothing but the hint until an element is wired and detected', gcCard && !gcCard.querySelector('input, select') && !/Manual ID|no preview/.test(gcCard.textContent), gcCard && gcCard.innerHTML.slice(0, 300));
    const ed3 = await editor([mk('raw', 'raw-html', { rawHtml: '<ul><li>a</li><li>b</li></ul>' }), mk('gc', 'get-children', {})], [cn('w', 'raw', 'output0', 'gc', 'input0')]);
    await wait(400);
    ok('E Get Children: once children are detected, its options appear', ed3.card('gc').querySelectorAll('select').length >= 1 && /2 children detected/.test(ed3.card('gc').textContent), ed3.card('gc').textContent);
    ok('E palette lists "CSS Custom" (not "CSS Text")', BUNDLE.includes('name:"CSS Custom",type:"css-text"') && !BUNDLE.includes('name:"CSS Text",type:"css-text"'));
  }

  // =========================================================== RUNTIME: Set Parent
  {
    const f = `({ " nlSide:s": { "__nlSideEffect": true, "value": __nodeSetParent("s", __nodeGetElement("item"), __nodeGetElement("dest"), "end", null, false) } })`;
    const rt = runtime(f, '<div id="src"><p id="item">I</p></div><div id="dest"><span>first</span></div>');
    await wait(150);
    const item = rt.doc.getElementById('item');
    ok('R Set Parent (no trigger) moves the element into the parent', item.parentNode.id === 'dest' && rt.doc.getElementById('dest').lastElementChild === item);
    rt.doc.getElementById('dest').appendChild(rt.doc.createElement('em'));
    let moves = 0;
    new rt.w.MutationObserver((l) => { moves += l.length; }).observe(rt.doc.getElementById('dest'), { childList: true });
    await recalc(rt.w); await recalc(rt.w);
    ok('R Set Parent (no trigger) is idempotent: no re-append while already inside', moves === 0 && item.parentNode.id === 'dest', `moves=${moves}`);
  }
  {
    const f = `({ " nlSide:s": { "__nlSideEffect": true, "value": __nodeSetParent("s", __nodeGetElement("outer"), __nodeGetElement("inner"), "end", null, false) } })`;
    const rt = runtime(f, '<div id="outer"><div id="inner"></div></div>');
    await wait(150);
    ok('R Set Parent refuses to move an element into its own descendant', rt.doc.getElementById('outer').parentNode === rt.doc.body && crashes(rt.errs).length === 0, rt.errs.join('|'));
  }
  {
    const g = [
      mk('ev', 'event-element', { eventUseManualId: true, eventId: 'btn', eventType: 'click' }),
      mk('r1', 'element-ref', { elementUseManualId: true, customElementId: 'item' }),
      mk('r2', 'element-ref', { elementUseManualId: true, customElementId: 'dest' }),
      mk('sp', 'set-parent', { setParentPosition: 'start' }),
    ];
    const c = [cn('a', 'r1', 'output0', 'sp', 'input0'), cn('b', 'r2', 'output0', 'sp', 'input1'), cn('d', 'ev', 'output0', 'sp', 'input2')];
    const ed = await editor(g, c);
    ok('E Set Parent compiles as a side-effect root (runs with no Output)', /" nlSide:sp"/.test(ed.formula()) && /__nodeSetParent\("sp", /.test(ed.formula()), ed.formula());
    const rt = runtime(ed.formula(), '<button id="btn">go</button><p id="item">I</p><div id="dest"><span>s</span></div>');
    await wait(150);
    const item = rt.doc.getElementById('item');
    ok('R Set Parent with Trigger: nothing moves before the event', item.parentNode === rt.doc.body);
    rt.doc.getElementById('btn').click();
    await wait(150);
    ok('R ...moves on the event, to the chosen position (first child)', item.parentNode.id === 'dest' && rt.doc.getElementById('dest').firstElementChild === item, rt.doc.body.innerHTML);
  }

  // =========================================================== RUNTIME: Clone Element + Elements by Class
  {
    const g = [
      mk('r1', 'element-ref', { elementUseManualId: true, customElementId: 'card' }),
      mk('cl', 'clone-element', { clonePlacement: 'after' }),
      mk('byc', 'elements-by-class', { classNames: 'card' }),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('r2', 'element-ref', { elementUseManualId: true, customElementId: 'count' }),
    ];
    const c = [cn('a', 'r1', 'output0', 'cl', 'input0'), cn('b', 'r2', 'output0', 'out', 'input0'), cn('d', 'byc', 'output1', 'out', 'input1')];
    const ed = await editor(g, c);
    const rt = runtime(ed.formula(), '<div id="card" class="card"><label for="in">L</label><input id="in"></div><div id="count">-</div>');
    await wait(250);
    const cards = rt.doc.querySelectorAll('.card');
    ok('R Clone (no trigger) makes exactly one copy, right after the original', cards.length === 2 && cards[0].id === 'card' && cards[0].nextElementSibling === cards[1], rt.doc.body.innerHTML);
    ok('R the copy gets unique ids and its label follows its input', /^card-nlcopy\d+$/.test(cards[1].id) && cards[1].querySelector('label').getAttribute('for') === cards[1].querySelector('input').id && cards[1].querySelector('input').id !== 'in', cards[1].outerHTML);
    await recalc(rt.w); await recalc(rt.w);
    ok('R re-evaluation never makes more copies', rt.doc.querySelectorAll('.card').length === 2);
    ok('R Elements by Class sees the copy (Count = 2 after the follow-up pass)', rt.doc.getElementById('count').textContent === '2', rt.doc.getElementById('count').textContent);
  }
  {
    const g = [
      mk('ev', 'event-element', { eventUseManualId: true, eventId: 'btn', eventType: 'click' }),
      mk('r1', 'element-ref', { elementUseManualId: true, customElementId: 'tpl' }),
      mk('cl', 'clone-element', { clonePlacement: 'after' }),
      mk('len', 'array-length', {}),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('r2', 'element-ref', { elementUseManualId: true, customElementId: 'count' }),
    ];
    const c = [cn('a', 'r1', 'output0', 'cl', 'input0'), cn('b', 'ev', 'output0', 'cl', 'input1'), cn('d', 'cl', 'output1', 'len', 'input0'), cn('e', 'r2', 'output0', 'out', 'input0'), cn('f', 'len', 'output0', 'out', 'input1')];
    const ed = await editor(g, c);
    const rt = runtime(ed.formula(), '<button id="btn">+</button><p id="tpl" class="row">row</p><div id="count">-</div>');
    await wait(200);
    ok('R Clone with Trigger: no copy before the first event', rt.doc.querySelectorAll('.row').length === 1);
    for (let i = 0; i < 3; i++) { rt.doc.getElementById('btn').click(); await wait(120); }
    const rows = Array.from(rt.doc.querySelectorAll('.row'));
    ok('R ...one new copy per event, kept in order after the original', rows.length === 4 && rows[0].id === 'tpl' && new Set(rows.map((r) => r.id)).size === 4, rt.doc.body.innerHTML);
    ok('R All Clones output lists every copy', rt.doc.getElementById('count').textContent === '3', rt.doc.getElementById('count').textContent);
  }
  {
    const f = `({ " nlSide:c": { "__nlSideEffect": true, "value": (__nodeCloneElement("c", __nodeGetElement("wrap"), "after", null, false)).clone } })`;
    const rt = runtime(f, '<div id="wrap"><div data-nodelogic-logic="1" data-formula="1"></div></div>');
    await wait(150);
    ok('R Clone refuses to copy a NodeLogic logic block (its graph would run twice)', rt.doc.querySelectorAll('[id^="wrap"]').length === 1);
  }
  {
    const f = `({ "o": { "__targetId": "n", "value": __nodeArrayLength(__nodeElementsByClass("a b", __nodeGetElement("scope"))) }, "o2": { "__targetId": "n2", "value": __nodeArrayLength(__nodeElementsByClass("x\\" onmouseover=\\"1", null)) } })`;
    const rt = runtime(f, '<div id="scope"><i class="a b"></i><i class="a"></i><i class="b a c"></i></div><i class="a b"></i><div id="n"></div><div id="n2"></div>');
    await wait(150);
    ok('R Elements by Class: ALL classes must match, only inside Scope', rt.doc.getElementById('n').textContent === '2', rt.doc.getElementById('n').textContent);
    ok('R Elements by Class: a hostile class string is just a (non-matching) class', rt.doc.getElementById('n2').textContent === '0' && crashes(rt.errs).length === 0, rt.errs.join('|'));
  }
  {
    // For Each over Elements by Class -> Output.Element -> Set Text on each.
    const g = [
      mk('byc', 'elements-by-class', { classNames: 'item' }),
      mk('fe', 'array-for-each', {}),
      mk('out', 'output', { outputTargetElementPin: true }),
      mk('st', 'action-set-text', {}),
      mk('v', 'constant-string', { value: 'DONE' }),
    ];
    const c = [cn('a', 'byc', 'output0', 'fe', 'input0'), cn('b', 'fe', 'output0', 'out', 'input0'), cn('d', 'out', 'output0', 'st', 'input0'), cn('e', 'v', 'output0', 'st', 'input1')];
    const ed = await editor(g, c);
    const fe = ed.state().elements.find((e) => e.id === 'fe');
    ok('E For Each over Elements by Class: loop item is an element', fe && (fe.valueType === 'element' || (fe.data && fe.data.arrayItemType === 'element')), JSON.stringify(fe));
    const rt = runtime(ed.formula(), '<p class="item">a</p><p class="item">b</p><p>c</p>');
    await wait(200);
    ok('R For Each over Elements by Class reaches every matching element', Array.from(rt.doc.querySelectorAll('p')).map((p) => p.textContent).join(',') === 'DONE,DONE,c', rt.doc.body.innerHTML + ' | ' + ed.formula());
  }

  // =========================================================== RUNTIME: Raw HTML per For Each item
  {
    const html = JSON.stringify('<li class="row"><span>x</span></li>');
    const body = JSON.stringify(`__nodeSetParent("sp", __nodeRawHtml("raw", ${html}, [["0", "text", ""]], [__nodeGetElementProp(__nodeLoopItem, "textContent")]), __nodeGetElement("list"), "end", null, false)`);
    const f = `({ " nlSide:x": { "__nlSideEffect": true, "value": __nodeArrayMapGraph(__nodeElementsByClass("src", null), ${body}) } })`;
    const rt = runtime(f, '<i class="src">A</i><i class="src">B</i><i class="src">C</i><ul id="list"></ul>');
    await wait(200);
    const texts = () => Array.from(rt.doc.querySelectorAll('#list .row')).map((r) => r.textContent).join(',');
    ok('R Raw HTML inside For Each: one element per item', texts() === 'A,B,C', rt.doc.getElementById('list').innerHTML);
    const firstRow = rt.doc.querySelector('#list .row');
    rt.doc.querySelectorAll('.src')[2].remove();
    await recalc(rt.w, 200);
    ok('R ...an item that disappears takes its element with it; the others stay the same nodes', texts() === 'A,B' && rt.doc.querySelector('#list .row') === firstRow, rt.doc.getElementById('list').innerHTML);
  }

  // =========================================================== RUNTIME: follow-up passes are bounded
  {
    // Two Set Parent nodes fighting over one element: must not loop forever.
    const f = `({ " nlSide:a": { "__nlSideEffect": true, "value": __nodeSetParent("a", __nodeGetElement("it"), __nodeGetElement("p1"), "end", null, false) }, " nlSide:b": { "__nlSideEffect": true, "value": __nodeSetParent("b", __nodeGetElement("it"), __nodeGetElement("p2"), "end", null, false) } })`;
    const rt = runtime(f, '<div id="p1"></div><div id="p2"></div><b id="it">x</b>');
    await wait(400);
    const before = rt.rafs();
    await wait(400);
    ok('R a ping-pong graph settles (bounded structural follow-ups, no endless recalculation)', rt.rafs() === before && before <= 6, `rafs ${before} -> ${rt.rafs()}`);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
