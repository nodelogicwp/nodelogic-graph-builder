/* Elementor editor-only helper/handle elements must be filtered out of Get
 * Children discovery so the stored child index matches the rendered frontend. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = require('path').resolve(__dirname, '..');
const PR = require('./previewResolver.cjs');
const FRONT = fs.readFileSync(require('path').join(ROOT, "frontend.js"), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const tags = (arr) => arr.map((e) => (e.tagName || '').toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).split(' ')[0] : ''));

// ---- expose real frontend helpers ----
function inst(src) { const m = '\n})();'; const i = src.lastIndexOf(m); return src.slice(0, i) + '\n;window.__NL={__nodeGetElement:__nodeGetElement,__nodeGetChildren:__nodeGetChildren,__nodeGetChildAt:__nodeGetChildAt};' + src.slice(i); }
const SRC = inst(FRONT);
function frontHelpers(html) {
  const d = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'dangerously', url: 'https://s.test/' });
  d.window.eval(CSSP);
  const s = d.window.document.createElement('script'); s.textContent = SRC; d.window.document.body.appendChild(s);
  return { d, NL: d.window.__NL };
}

/* ============================================================================
 * 1. The user's exact case: editor DOM has [overlay, h2, resize-handle]
 * ========================================================================== */
{
  // EDITOR/preview markup: Elementor injects the overlay + a jQuery-UI resize
  // handle as real children around the authored <h2>.
  const editorHtml = `
    <div id="text-1" class="elementor-element elementor-widget elementor-widget-heading" data-element_type="widget">
      <div class="elementor-element-overlay"><ul class="elementor-editor-element-settings"><li>edit</li></ul></div>
      <div class="elementor-widget-container"><h2 class="elementor-heading-title">Hello</h2></div>
      <div class="ui-resizable-handle ui-resizable-e"></div>
    </div>`;
  const ed = new JSDOM(`<!doctype html><body>${editorHtml}</body>`);
  const parent = ed.window.document.getElementById('text-1');

  const kids = PR.directElementChildren(parent);
  ok('editor: raw children are [overlay, widget-container, resize-handle]',
    parent.children.length === 3, tags(Array.from(parent.children)).join(','));
  ok('editor: directElementChildren filters chrome + descends wrapper -> [h2]',
    kids.length === 1 && kids[0].tagName === 'H2', tags(kids).join(','));
  ok('editor: getPreviewChildAt(parent, 0) is the real <h2>',
    PR.getPreviewChildAt(parent, 0) === parent.querySelector('h2'));
  const det = PR.detectElementChildren('', { element: parent });
  ok('editor: detectElementChildren count = 1, child 0 tag = h2 (index used for pin mapping)',
    det.count === 1 && det.children[0].index === 0 && det.children[0].tag === 'h2', JSON.stringify(det.children));

  // FRONTEND markup: no chrome. Child 0 must be the same <h2>.
  const { NL } = frontHelpers(`<div id="text-1" class="elementor-element elementor-widget"><div class="elementor-widget-container"><h2>Hello</h2></div></div>`);
  const fkids = NL.__nodeGetChildren('text-1');
  ok('frontend: __nodeGetChildren -> [h2]', fkids.length === 1 && fkids[0].tagName === 'H2', fkids.map(e => e.tagName).join(','));
  ok('frontend: __nodeGetChildAt(., 0) is the <h2>  (SAME index 0 as the editor stored)',
    NL.__nodeGetChildAt('text-1', 0) && NL.__nodeGetChildAt('text-1', 0).textContent === 'Hello');
}

/* ============================================================================
 * 2. plain container, interleaved chrome, MULTIPLE real children -> order + index
 * ========================================================================== */
{
  const editorHtml = `
    <div id="c" class="elementor-element e-con" data-element_type="container">
      <div class="elementor-element-overlay"></div>
      <div class="e-con-inner">
        <div class="ui-resizable-handle ui-resizable-n"></div>
        <div class="elementor-element" id="w-a" data-element_type="widget"><div class="elementor-widget-container"><h3>A</h3></div></div>
        <div class="elementor-first-add"></div>
        <div class="elementor-element" id="w-b" data-element_type="widget"><div class="elementor-widget-container"><h3>B</h3></div></div>
        <div class="ui-resizable-handle ui-resizable-s"></div>
      </div>
      <div class="elementor-add-section-inner"></div>
    </div>`;
  const ed = new JSDOM(`<!doctype html><body>${editorHtml}</body>`);
  const parent = ed.window.document.getElementById('c');
  const kids = PR.directElementChildren(parent);
  ok('editor container: filtered children are [#w-a, #w-b] in order (chrome + wrappers removed)',
    kids.length === 2 && kids[0].id === 'w-a' && kids[1].id === 'w-b', tags(kids).join(','));
  ok('editor container: pin index 1 -> #w-b (matches frontend)', PR.getPreviewChildAt(parent, 1) && PR.getPreviewChildAt(parent, 1).id === 'w-b');

  const { NL } = frontHelpers(`<div id="c" class="elementor-element e-con"><div class="e-con-inner">
      <div class="elementor-element" id="w-a"><div class="elementor-widget-container"><h3>A</h3></div></div>
      <div class="elementor-element" id="w-b"><div class="elementor-widget-container"><h3>B</h3></div></div>
    </div></div>`);
  const fk = NL.__nodeGetChildren('c');
  ok('frontend container: __nodeGetChildren -> [#w-a, #w-b] (same indices)',
    fk.length === 2 && fk[0].id === 'w-a' && fk[1].id === 'w-b', fk.map(e => e.id).join(','));
}

/* ============================================================================
 * 3. regression: plain, chrome-free markup unaffected
 * ========================================================================== */
{
  const ed = new JSDOM(`<!doctype html><body><div id="p"><h2>Hi</h2><span>x</span></div></body>`);
  const kids = PR.directElementChildren(ed.window.document.getElementById('p'));
  ok('plain markup: [h2, span] unchanged', kids.length === 2 && kids[0].tagName === 'H2' && kids[1].tagName === 'SPAN', tags(kids).join(','));

  const { NL } = frontHelpers(`<div data-nodelogic-id="text-1"><h2>Hello</h2></div>`);
  ok('plain frontend: __nodeGetChildAt(text-1,0) -> h2 "Hello"',
    NL.__nodeGetChildAt('text-1', 0) && NL.__nodeGetChildAt('text-1', 0).textContent === 'Hello');
}

/* ============================================================================
 * 4. full pipeline through real applyLogicBlocks (fixed-editor formula)
 * ========================================================================== */
{
  const html = `<!doctype html><body>
    <div data-nodelogic-id="text-1"><h2>Hello</h2></div>
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div>
  </body>`;
  const d = new JSDOM(html, { runScripts: 'dangerously', url: 'https://s.test/' });
  d.window.eval(CSSP);
  d.window.document.getElementById('lb').setAttribute('data-formula',
    `({ " nlOutEl:o1": { "__element": __nodeGetChildAt(__nodeGetElement("text-1"), 0), "__executeOnLoad": true, actions: [ { type: "setText", value: "Changed" } ] } })`);
  const s = d.window.document.createElement('script'); s.textContent = FRONT; d.window.document.body.appendChild(s);
  d.window.document.dispatchEvent(new d.window.Event('DOMContentLoaded', { bubbles: true }));
  ok('pipeline: Get Children(0) -> Output.Element -> Set Text -> <h2> = "Changed"',
    d.window.document.querySelector('[data-nodelogic-id="text-1"] h2').textContent === 'Changed');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
