/* Stale Get Element Property across separate graph executions — release
 * blocker.
 *
 * Root cause: `formulaEvaluationCache`'s key (formula + tracked-control
 * state + event triggeredCounts) has no way to represent "an arbitrary
 * element's property, read via __nodeGetElementProp, was just mutated by a
 * PRIOR pass of this very formula" (a Set Element Property / Output "value"
 * write is a plain, unconditional DOM write with no signature of its own).
 * A graph with no event/control dependency at all -- Get Element Property ->
 * Add 1 -> Output.value -- therefore hashes to the SAME evaluationKey on
 * every subsequent execution: cache HIT, evaluateFormulaExpression (and so
 * __nodeGetElementProp) never runs again, and the very first DOM read is
 * replayed forever, so the graph is frozen at its first computed result
 * instead of advancing on every execution.
 *
 * Fix: a formula whose text calls __nodeGetElementProp is never persisted
 * into formulaEvaluationCache (mirrors the existing "never cache a live
 * __element result" rule for the same reason: mutable, cache-key-invisible
 * state). Every execution therefore re-evaluates the formula fresh and
 * __nodeGetElementProp reads the CURRENT DOM. Unrelated / non-property-reading
 * formulas keep caching exactly as before, and nothing changes about how many
 * times a formula is evaluated WITHIN one pass (evaluateFormulaExpression is
 * already called at most once per applyLogicBlocks() pass, cache or not).
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

function boot(bodyHtml, formula, expose) {
  const html = `<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div>
  </body>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  // Real browsers debounce scheduleRecalculation() via requestAnimationFrame;
  // jsdom has none. Polyfill it so this suite exercises the actual
  // production recalculation pipeline instead of a bypass.
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  w.document.getElementById('lb').setAttribute('data-formula', formula);

  let src = FRONT;
  const marker = '\n})();';
  const idx = src.lastIndexOf(marker);
  src = src.slice(0, idx) + `\n;window.__DBG = { scheduleRecalculation, formulaEvaluationCache${expose ? ', ' + expose : ''} };` + src.slice(idx);
  const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return w;
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  /* ================================================================
   * 1. THE regression, exactly as reported: Get Element Property ->
   *    Add 1 -> Output.value, executed 3 times in a row. Each execution
   *    must read the CURRENT (just-mutated) DOM value, not the first
   *    execution's snapshot.
   * ================================================================ */
  {
    const w = boot(
      '<div id="target">start</div>',
      `({ "target": { "value": (__nodeToNumber(__nodeGetElementProp(__nodeGetElement("target"), "textContent")) + 1) } })`
    );
    await wait(80); // let the page-load execution settle
    const target = w.document.getElementById('target');
    const DBG = w.__DBG;

    target.textContent = '5';
    const expected = [6, 7, 8];
    for (let i = 0; i < 3; i++) {
      DBG.scheduleRecalculation();
      await wait(60);
      ok(`1) execution #${i + 1}: reads the DOM as mutated by the previous execution (-> ${expected[i]})`,
        target.textContent === String(expected[i]), target.textContent);
    }
  }

  /* ================================================================
   * 2. formulaEvaluationCache never persists a formula that calls
   *    __nodeGetElementProp (the actual mechanism of the fix).
   * ================================================================ */
  {
    const w = boot(
      '<div id="target2">5</div>',
      `({ "target2": { "value": (__nodeToNumber(__nodeGetElementProp(__nodeGetElement("target2"), "textContent")) + 1) } })`
    );
    await wait(80);
    const DBG = w.__DBG;
    DBG.scheduleRecalculation();
    await wait(60);
    ok('2) a Get-Element-Property formula is never cached (size stays 0)', DBG.formulaEvaluationCache.size === 0, `size=${DBG.formulaEvaluationCache.size}`);
  }

  /* ================================================================
   * 3. Legitimate caching is NOT broken: a formula that does NOT read a
   *    live element property still caches and is reused across passes
   *    with unchanged inputs (no regression to the existing perf path).
   * ================================================================ */
  {
    const w = boot(
      '<div id="target3">0</div>',
      `({ "target3": { "value": (2 + 2) } })`
    );
    await wait(80);
    const DBG = w.__DBG;
    const sizeAfterLoad = DBG.formulaEvaluationCache.size;
    ok('3a) a plain formula (no Get Element Property) IS cached', sizeAfterLoad > 0, `size=${sizeAfterLoad}`);
    DBG.scheduleRecalculation();
    await wait(60);
    ok('3b) re-running it with nothing changed does not grow the cache (reused, not re-evaluated)',
      DBG.formulaEvaluationCache.size === sizeAfterLoad, `size=${DBG.formulaEvaluationCache.size} vs ${sizeAfterLoad}`);
  }

  /* ================================================================
   * 4. Within ONE execution, reading the same live property twice must
   *    see the SAME (single, consistent) DOM snapshot -- the fix must
   *    not fragment a single evaluateFormulaExpression() call.
   * ================================================================ */
  {
    const w = boot(
      '<div id="target4">10</div><div id="sinkA">-</div><div id="sinkB">-</div>',
      `({
        "sinkA": { "value": __nodeGetElementProp(__nodeGetElement("target4"), "textContent") },
        "sinkB": { "value": __nodeGetElementProp(__nodeGetElement("target4"), "textContent") }
      })`
    );
    await wait(80);
    const sinkA = w.document.getElementById('sinkA');
    const sinkB = w.document.getElementById('sinkB');
    ok('4) two reads of the same property within one execution agree',
      sinkA.textContent === sinkB.textContent && sinkA.textContent === '10', `${sinkA.textContent} / ${sinkB.textContent}`);
  }

  /* ================================================================
   * 5. Unrelated blocks are unaffected: a live-property-reading block and
   *    a plain cacheable block coexist correctly on the same page.
   * ================================================================ */
  {
    const dom = new JSDOM(`<!doctype html><body>
      <div id="target5">5</div>
      <div data-nodelogic-logic="1" id="lbLive" data-output-configs="{}" style="display:none"></div>
      <div data-nodelogic-logic="1" id="lbPlain" data-output-configs="{}" style="display:none"></div>
    </body>`, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(CSSP);
    let rafId = 1;
    w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
    w.cancelAnimationFrame = () => {};
    w.document.getElementById('lbLive').setAttribute('data-formula',
      `({ "target5": { "value": (__nodeToNumber(__nodeGetElementProp(__nodeGetElement("target5"), "textContent")) + 1) } })`);
    w.document.getElementById('lbPlain').setAttribute('data-formula', `({ "unused-plain-target": { "value": 42 } })`);

    let src = FRONT;
    const marker = '\n})();';
    const idx = src.lastIndexOf(marker);
    src = src.slice(0, idx) + '\n;window.__DBG = { scheduleRecalculation, formulaEvaluationCache };' + src.slice(idx);
    const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await wait(80);

    const target = w.document.getElementById('target5');
    const DBG = w.__DBG;
    target.textContent = '5';
    DBG.scheduleRecalculation();
    await wait(60);
    DBG.scheduleRecalculation();
    await wait(60);
    ok('5) live-property block keeps advancing (6 then 7) alongside a plain cached sibling block',
      target.textContent === '7', target.textContent);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
