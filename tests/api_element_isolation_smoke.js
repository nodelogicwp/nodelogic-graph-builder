/* Regression test for a real, reported bug: adding an unrelated async API
 * branch to a logic block silently changes the result of an existing,
 * unrelated Element/GetChildren/ArrayMapGraph branch on a later
 * recalculation.
 *
 * Root cause (confirmed via a real-bundle repro during investigation):
 * Branch A's own Output writes its computed `value` back onto the exact
 * same element it read `textContent` FROM (`__element: __nodeLoopItem`).
 * `__nodeGetElementProp` always reads the live DOM, and a full
 * recalculation re-evaluates the ENTIRE formula (both branches) from
 * scratch on every trigger. So the pass AFTER Branch A's own Output has run
 * once reads back its own prior output instead of the child's real content
 * -- corrupting the length check forever, since both possible outputs
 * ("child element" / "single element") are under 16 characters. Branch B
 * (the API call) never touches Branch A's elements; it is simply the first
 * thing in this graph that ever triggers a SECOND recalculation pass via
 * scheduleRecalculation() once its request resolves, which is what exposes
 * the pre-existing self-referential feedback loop.
 *
 * Fix: frontend.js now tracks, per (element, "value"|"textContent"), the
 * last value THIS runtime itself wrote and the pre-write baseline. A read
 * whose live DOM value still exactly matches what we last wrote is treated
 * as an echo of our own output and returns the baseline instead -- while a
 * genuinely external change is still picked up immediately (Get Element
 * Property freshness is preserved).
 *
 * This test uses the user's EXACT reported formula shape (only the target
 * ids substituted for real DOM elements), stubs the API to resolve
 * asynchronously, and verifies Branch A is byte-identical across all three
 * states, survives the API resolving, AND survives a second, independent
 * forced recalculation afterward.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const FRONT = fs.readFileSync(path.join(ROOT, 'frontend.js'), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 60000);

// Same fake-XHR harness pattern as tests/api_async_smoke.js: resolves
// asynchronously (real-browser shape) after a short delay.
function withFakeXHR(responseBody, delayMs) {
  return `
    (function(){
      function X(){ this._h={}; }
      X.prototype.open=function(m,u,a){ this._m=m; this._u=u; };
      Object.defineProperty(X.prototype,'withCredentials',{ set:function(v){}, get:function(){ return false; } });
      X.prototype.setRequestHeader=function(k,v){ this._h[k]=v; };
      X.prototype.send=function(b){
        const self = this;
        setTimeout(() => {
          self.status = 200;
          self.responseText = ${JSON.stringify(JSON.stringify(responseBody))};
          if (self.onload) self.onload();
        }, ${delayMs});
      };
      window.XMLHttpRequest = X;
    })();
  `;
}

function boot(formula, preScript) {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="child-el">
      <span id="c-short">short</span>
      <span id="c-long">This child has plenty of text</span>
    </div>
    <div id="test">unset</div>
    <input id="trigger" data-formula="1" style="display:none">
    <div data-nodelogic-logic="1" id="lb" data-editor-id="e1" data-output-configs="{}" style="display:none"></div>
  </body>`, { runScripts: 'dangerously', url: 'https://s.test/', pretendToBeVisual: true });
  dom.window.eval(CSSP);
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

const branchAText = (dom) => ({
  short: dom.window.document.getElementById('c-short').textContent,
  long: dom.window.document.getElementById('c-long').textContent,
});
const branchBText = (dom) => dom.window.document.getElementById('test').textContent;

// The user's exact reported formula shape, with real target ids.
const FORMULA = `({
  "nlOutEl:node-a": __nodeArrayMapGraph(
    __nodeGetChildren(__nodeGetElement("child-el")),
    "({ \\"__element\\": __nodeLoopItem, \\"__executeOnLoad\\": true, \\"value\\": (((String(__nodeGetElementProp(__nodeLoopItem, \\"textContent\\")).length >= 16)) ? (\\"child element\\") : (\\"single element\\")) })"
  ),
  "nlOutEl:node-b": {
    "__element": __nodeGetElement("test"),
    "__executeOnLoad": true,
    "value": __nodeToString(__nodeGetPath(__nodeApiRequest("https://jsonplaceholder.typicode.com/posts/1", "GET", "", "", 15000), "title", "Error"))
  }
})`;

(async () => {
  const { dom, errs } = boot(FORMULA, withFakeXHR({ title: 'Fetched Title' }, 200));

  // 1) Branch A before the API resolves (first synchronous evaluation pass).
  await wait(60);
  const before = branchAText(dom);
  ok('Branch A (before API resolves): long child -> "child element"', before.long === 'child element', JSON.stringify(before));
  ok('Branch A (before API resolves): short child -> "single element"', before.short === 'single element', JSON.stringify(before));
  ok('Branch B (pending): shows the Error fallback, not a crash', branchBText(dom) === 'Error', branchBText(dom));

  // 2) Branch A while the API is still in flight (mid-flight snapshot).
  const mid = branchAText(dom);
  ok('Branch A (while API pending) unchanged from before', mid.long === before.long && mid.short === before.short, JSON.stringify(mid));

  // 3) Branch A after the API resolves and triggers its own recalculation.
  await wait(350);
  const after = branchAText(dom);
  ok('Branch A (after API resolves): long child STILL "child element"', after.long === 'child element', JSON.stringify(after));
  ok('Branch A (after API resolves): short child STILL "single element"', after.short === 'single element', JSON.stringify(after));

  // 4) Branch A remains identical across all three states.
  ok('Branch A identical across before/mid/after', before.long === mid.long && mid.long === after.long && before.short === mid.short && mid.short === after.short, JSON.stringify({ before, mid, after }));

  // 5) Branch B eventually becomes the correct API title.
  ok('Branch B eventually shows the real API title', branchBText(dom) === 'Fetched Title', branchBText(dom));

  // 6) A second, independent recalculation (simulating any other later
  // trigger elsewhere in the page -- here, an unrelated tracked control
  // firing an "input" event) still must not alter Branch A.
  dom.window.document.getElementById('trigger').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await wait(150);
  const second = branchAText(dom);
  ok('A second later recalculation cannot alter Branch A', second.long === 'child element' && second.short === 'single element', JSON.stringify(second));

  ok('no runtime errors', errs.filter((e) => /Cannot read|is not a function|SyntaxError|Unexpected/i.test(e)).length === 0, errs.join(';'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
