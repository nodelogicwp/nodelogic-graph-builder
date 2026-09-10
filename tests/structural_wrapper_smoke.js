/* Editor <-> runtime agreement on child enumeration through Elementor wrappers. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const PR = require('./previewResolver.cjs');
const FRONTEND = 'C:\\Users\\User\\Desktop\\Env_Product\\Product\\nodelogic-graph-builder-work\\frontend.js';
let s = fs.readFileSync(FRONTEND, 'utf8');
const mk = '\n})();'; const i = s.lastIndexOf(mk);
s = s.slice(0, i) + '\n;window.__T={__nodeGetElement,__nodeGetChildren,__nodeGetChildAt,__nodeGetChildrenSubset};' + s.slice(i);
const CSSP = 'window.CSS=window.CSS||{escape:x=>String(x).replace(/[^a-zA-Z0-9_-]/g,c=>"\\\\"+c)};';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };

const HTML = `<!doctype html><body>
  <div id="w-heading" class="elementor-element elementor-widget elementor-widget-heading" data-element_type="widget">
    <div class="elementor-widget-container"><h2 class="elementor-heading-title">Title</h2></div>
  </div>
  <div id="w-multi" class="elementor-element elementor-widget">
    <div class="elementor-widget-container"><a href="#">one</a><a href="#">two</a><a href="#">three</a></div>
  </div>
  <div id="c-flex" class="elementor-element e-con e-flex">
    <div class="e-con-inner"><div class="elementor-element" id="inner-a">A</div><div class="elementor-element" id="inner-b">B</div></div>
  </div>
  <div id="plain"><h2>p</h2><span>q</span></div>
  <div id="wc-direct" class="elementor-widget-container"><em>direct</em></div>
</body>`;

const dom = new JSDOM(HTML, { runScripts: 'dangerously', url: 'https://el.test/' });
dom.window.eval(CSSP);
const sc = dom.window.document.createElement('script'); sc.textContent = s; dom.window.document.body.appendChild(sc);
const T = dom.window.__T;
const doc = dom.window.document;
const tags = (arr) => arr.map((e) => (e.tagName || '').toLowerCase() + (e.id ? '#' + e.id : ''));

// helper: run both editor + runtime enumeration for an id
function both(id) {
  const editorEl = doc.getElementById(id);
  const editor = tags(PR.directElementChildren(editorEl));
  const runtime = tags(T.__nodeGetChildren(id));
  return { editor, runtime };
}

// 1. Elementor heading widget -> the <h2>, both sides
{
  const r = both('w-heading');
  ok('heading widget: runtime children = [h2]', JSON.stringify(r.runtime) === JSON.stringify(['h2']), JSON.stringify(r.runtime));
  ok('heading widget: editor children = [h2]', JSON.stringify(r.editor) === JSON.stringify(['h2']), JSON.stringify(r.editor));
  ok('heading widget: __nodeGetChildAt(0) is the real h2', T.__nodeGetChildAt('w-heading', 0) === doc.querySelector('#w-heading h2'));
  ok('heading widget: editor getPreviewChildAt(0) == same h2', PR.getPreviewChildAt(doc.getElementById('w-heading'), 0) === doc.querySelector('#w-heading h2'));
}

// 2. widget-container with several children -> all of them, order preserved
{
  const r = both('w-multi');
  ok('multi widget: runtime = [a,a,a]', JSON.stringify(r.runtime) === JSON.stringify(['a', 'a', 'a']), JSON.stringify(r.runtime));
  ok('multi widget: editor matches runtime', JSON.stringify(r.editor) === JSON.stringify(r.runtime));
  ok('multi widget: subset [2,0] -> 3rd then 1st anchor', (() => {
    const sub = T.__nodeGetChildrenSubset('w-multi', [2, 0]);
    return sub.length === 2 && sub[0].textContent === 'three' && sub[1].textContent === 'one';
  })());
}

// 3. flex container: descend through .e-con-inner
{
  const r = both('c-flex');
  ok('flex con: runtime = [#inner-a,#inner-b]', JSON.stringify(r.runtime) === JSON.stringify(['div#inner-a', 'div#inner-b']), JSON.stringify(r.runtime));
  ok('flex con: editor matches runtime', JSON.stringify(r.editor) === JSON.stringify(r.runtime));
}

// 4. plain markup: unchanged
{
  const r = both('plain');
  ok('plain: runtime = [h2,span]', JSON.stringify(r.runtime) === JSON.stringify(['h2', 'span']), JSON.stringify(r.runtime));
  ok('plain: editor = [h2,span]', JSON.stringify(r.editor) === JSON.stringify(['h2', 'span']), JSON.stringify(r.editor));
}

// 5. element that IS the widget-container: no phantom descent (its child isn't a wrapper)
{
  const r = both('wc-direct');
  ok('wc-direct: runtime = [em]', JSON.stringify(r.runtime) === JSON.stringify(['em']), JSON.stringify(r.runtime));
  ok('wc-direct: editor = [em]', JSON.stringify(r.editor) === JSON.stringify(['em']), JSON.stringify(r.editor));
}

// 6. detectElementChildren reflects the unwrap (editor UI dropdown)
{
  const det = PR.detectElementChildren('', { element: doc.getElementById('w-heading') });
  ok('detectElementChildren: count 1, child 0 is h2', det.count === 1 && det.children[0].tag === 'h2', JSON.stringify(det.children));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
