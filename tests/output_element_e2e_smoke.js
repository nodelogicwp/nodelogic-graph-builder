/* End-to-end: Get Children -> Output.Element -> Set Text / Value -> real DOM. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const FRONTEND = 'C:\\Users\\User\\Desktop\\Env_Product\\Product\\nodelogic-graph-builder-work\\frontend.js';
const src = fs.readFileSync(FRONTEND, 'utf8');
const CSS_ESCAPE =
  'window.CSS = window.CSS || { escape: function (s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return "\\\\" + ch; }); } };';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };

function run(label, bodyHtml, formula, checkFn, { withCss = true } = {}) {
  const html = `<!doctype html><html><body>${bodyHtml}
    <div data-nodelogic-logic="1" data-editor-id="e1" id="lb"
         data-output-configs="{}" style="display:none"></div>
  </body></html>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/page/' });
  if (withCss) dom.window.eval(CSS_ESCAPE);
  dom.window.document.getElementById('lb').setAttribute('data-formula', formula);
  const s = dom.window.document.createElement('script');
  s.textContent = src;
  dom.window.document.body.appendChild(s);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true }));
  try { checkFn(dom.window.document, label); }
  catch (e) { ok(label, false, 'threw ' + e.message); }
}

const F_SETTEXT = `({ " nlOutEl:out1": { "__element": __nodeGetChildAt(__nodeGetElement("text-1"), 0), "__executeOnLoad": true, actions: [ { type: "setText", value: "Changed" } ] } })`;
const F_VALUE = `({ " nlOutEl:out1": { "__element": __nodeGetChildAt(__nodeGetElement("text-1"), 0), "__executeOnLoad": true, "value": "ChangedVal" } })`;

/* A — user's stated structure */
run('A/SetText: <div data-nodelogic-id="text-1"><h2>', `<div data-nodelogic-id="text-1"><h2>Original</h2></div>`, F_SETTEXT, (doc, l) => {
  const h2 = doc.querySelector('[data-nodelogic-id="text-1"] h2');
  ok(l, h2 && h2.textContent === 'Changed', `h2=${JSON.stringify(h2 && h2.textContent)}`);
});
run('A/Value: <div data-nodelogic-id="text-1"><h2>', `<div data-nodelogic-id="text-1"><h2>Original</h2></div>`, F_VALUE, (doc, l) => {
  const h2 = doc.querySelector('[data-nodelogic-id="text-1"] h2');
  ok(l, h2 && h2.textContent === 'ChangedVal', `h2=${JSON.stringify(h2 && h2.textContent)}`);
});

/* B — id on the div */
run('B/SetText: <div id="text-1"><h2>', `<div id="text-1"><h2>Original</h2></div>`, F_SETTEXT, (doc, l) => {
  const h2 = doc.querySelector('#text-1 h2');
  ok(l, h2 && h2.textContent === 'Changed', `h2=${JSON.stringify(h2 && h2.textContent)}`);
});

/* C — Elementor published wrapper nesting: #text-1 > .elementor-widget-container > h2.
 *     After the fix, Get Children sees through .elementor-widget-container and
 *     targets the real <h2>. */
run('C/SetText: Elementor widget wrapper — targets the real h2',
  `<div id="text-1" class="elementor-element elementor-widget elementor-widget-heading" data-id="abc123" data-element_type="widget">
     <div class="elementor-widget-container"><h2 class="elementor-heading-title">Original</h2></div>
   </div>`,
  F_SETTEXT,
  (doc, l) => {
    const h2 = doc.querySelector('#text-1 h2');
    const wc = doc.querySelector('#text-1 > .elementor-widget-container');
    ok(l, h2 && h2.textContent === 'Changed' && wc && wc.firstElementChild === h2,
      `h2="${h2 && h2.textContent}"  container="${wc && wc.textContent}"  h2StillNested=${!!(wc && wc.firstElementChild === h2)}`);
  });
run('C/Value: Elementor widget wrapper — value writes to the real h2',
  `<div id="text-1" class="elementor-element elementor-widget elementor-widget-heading" data-element_type="widget">
     <div class="elementor-widget-container"><h2 class="elementor-heading-title">Original</h2></div>
   </div>`,
  F_VALUE,
  (doc, l) => {
    const h2 = doc.querySelector('#text-1 h2');
    ok(l, h2 && h2.textContent === 'ChangedVal', `h2="${h2 && h2.textContent}"`);
  });

/* C2 — deeper: #text-1(.elementor-element) > .elementor-widget-container > .elementor-text-editor > h2
 *      is NOT unwrapped past the single structural wrapper (text-editor may hold
 *      several children); child 0 is the text-editor div. Guards against
 *      over-descending. */
run('C2: stops at the structural wrapper, does not tunnel arbitrarily',
  `<div id="deep-1" class="elementor-element elementor-widget">
     <div class="elementor-widget-container">
       <div class="elementor-text-editor"><h2>Original</h2><p>keep</p></div>
     </div>
   </div>`,
  F_SETTEXT.replace(/text-1/g, 'deep-1'),
  (doc, l) => {
    const te = doc.querySelector('.elementor-text-editor');
    // child 0 of the unwrapped host is .elementor-text-editor -> Set Text hits it
    ok(l, te && te.textContent === 'Changed', `text-editor="${te && te.textContent}" (expected the wrapper's first real child)`);
  });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
