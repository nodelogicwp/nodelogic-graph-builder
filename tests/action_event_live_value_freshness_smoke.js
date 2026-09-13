/* Regression test built from the user's REAL, reported failing Gutenberg
 * block's data-formula (decoded verbatim below) -- not a hand-built
 * synthetic graph. tests/action_output_fanout_smoke.js already proves the
 * generic Action Output fan-out mechanism (branch storage, compile-time
 * traversal, per-branch listener identity/dedup) is correct; this suite
 * proves the SEPARATE, real bug found by tracing this exact formula's
 * runtime execution.
 *
 * ROOT CAUSE: registerActionListeners' per-Action-Event DOM listener
 * (frontend.js, the "event" case inside registerActionListeners) applied its
 * leaf actions but never called scheduleRecalculation() afterward -- unlike
 * __nodeEvent (the older Event-node primitive), whose native listener does
 * call scheduleRecalculation() on every fire. A plain trigger button used
 * only as an Action Event source (not a form control, not a button-group,
 * not referenced via [id]-bracket syntax anywhere in the formula) is never
 * otherwise wired to scheduleRecalculation, so NOTHING re-evaluates the
 * block after the initial page-load pass. Any "connected logic flow" Set
 * Value that reads live DOM state via __nodeGetElementProp (e.g. a counter
 * reading its own current displayed value, adding 1) is therefore computed
 * and baked into that Action Event's listener closure EXACTLY ONCE, at page
 * load, and never refreshed again -- every later click of that branch, or
 * of a sibling branch attached to the same Output, silently reapplies the
 * frozen value. This reads exactly like "one Action Event branch overwrites/
 * ignores another," but both branches were always dispatching correctly and
 * independently the whole time (confirmed via instrumentation before this
 * fix) -- the bug is a missing re-evaluation trigger, not a fan-out/branch-
 * identity collision.
 *
 * FIX: registerActionListeners' listener callback now calls
 * scheduleRecalculation() after applyLeafActionNodes, mirroring __nodeEvent
 * (frontend.js ~line 1737). This does not re-apply the leaf actions again
 * (the recalculation pass explicitly skips "event"-typed nodes, see
 * applyLeafActionNodes' early return) -- it only lets the NEXT
 * applyLogicBlocks pass recompute this branch's live-DOM-dependent value and
 * re-register its listener with a fresh one, before the branch's NEXT click.
 *
 * NOTE on the literal reported formula: it reads via
 * __nodeGetElementProp(el, "textContent") but writes via a "setValue" leaf
 * action, which only ever writes a form-control's .value (setControlValue) --
 * no browser ever syncs a .value write back into .textContent, on any
 * element, with or without this fix. Section 1 below locks in that exact,
 * documented (not-a-regression) behavior for the formula AS GIVEN. Section 2
 * uses the identical Output/Action-Event/Set-Value shape with the ONE
 * property name corrected to match what "Set Value" actually writes
 * (Property: "value", target an <input>) -- the freshness fix restores the
 * exact interleaved Special/Reset/Special behavior from the original report.
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

function bootRuntime(bodyHtml, formula) {
  const html = `<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div>
  </body>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  w.document.getElementById('lb').setAttribute('data-formula', formula);
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return w;
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 60000);

(async () => {
  /* ============================================================
   * 1. The EXACT reported data-formula, decoded verbatim. Locks in
   *    the documented (not-in-scope) textContent/setValue property
   *    mismatch as known, stable behavior -- and proves the two
   *    branches dispatch correctly and independently regardless.
   * ============================================================ */
  {
    const REAL_FORMULA = '({ " nlOutTarget:1776422960909": { "__targetId": "color_r", "background": "#ff0000" }, " nlOutTarget:1776423000414": { "__targetId": "color_g", "background": "#00ff00" }, " nlOutTarget:1776423009941": { "__targetId": "color_b", "background": "#0000ff" }, " nlOutEl:1776773001727": { "__element": __nodeGetElement("counter_element"), "__executeOnLoad": true, actions: [({ type: "event", sourceId: "special_button", eventType: "click", actions: [({ type: "setValue", value: (__nodeToNumber(__nodeGetElementProp(__nodeGetElement("counter_element"), "textContent")) + 1) })] }), ({ type: "event", sourceId: "reset_btn", eventType: "click", actions: [({ type: "setValue", value: -1 })] })] } })';

    const w = bootRuntime(
      `<div id="color_r" data-nodelogic-id="color_r">r</div>
       <div id="color_g" data-nodelogic-id="color_g">g</div>
       <div id="color_b" data-nodelogic-id="color_b">b</div>
       <button id="special_button">Special</button>
       <button id="reset_btn">Reset</button>
       <div id="counter_element" data-nodelogic-id="counter_element">0</div>`,
      REAL_FORMULA
    );
    await wait(200);
    const counter = w.document.getElementById('counter_element');
    const click = (id) => w.document.getElementById(id).dispatchEvent(new w.Event('click', { bubbles: true }));

    ok('1a) init: color outputs applied on load', w.document.getElementById('color_r').style.background === 'rgb(255, 0, 0)', w.document.getElementById('color_r').style.background);

    click('special_button'); await wait(100);
    ok('1b) Special dispatches its own branch (0 + 1)', counter.value === '1', counter.value);

    click('reset_btn'); await wait(100);
    ok('1c) Reset dispatches independently, its own constant, unaffected by Special', counter.value === '-1', counter.value);

    click('special_button'); await wait(100);
    // Documented, not-a-regression: __nodeGetElementProp reads .textContent,
    // which "setValue" never writes (setControlValue only ever writes
    // .value) -- Special's read-back is stuck on the never-changing
    // textContent ("0") on EVERY click, independent of the freshness fix.
    ok('1d) Special (as literally authored) always recomputes from unchanged textContent -> 1, not corrupted by Reset', counter.value === '1', counter.value);

    click('reset_btn'); await wait(100);
    ok('1e) Reset still independently reachable after repeated Special firing', counter.value === '-1', counter.value);
  }

  /* ============================================================
   * 2. IDENTICAL Output/Action-Event/Set-Value shape and node ids,
   *    Property corrected to "value" (matching what setValue
   *    actually writes) on an <input> -- the freshness fix under
   *    test. Replays the exact Special/Reset/Special/Reset ordering
   *    from the original report.
   * ============================================================ */
  {
    const FIXED_FORMULA = '({ " nlOutEl:1776773001727": { "__element": __nodeGetElement("counter_element"), "__executeOnLoad": true, actions: [({ type: "event", sourceId: "special_button", eventType: "click", actions: [({ type: "setValue", value: (__nodeToNumber(__nodeGetElementProp(__nodeGetElement("counter_element"), "value")) + 1) })] }), ({ type: "event", sourceId: "reset_btn", eventType: "click", actions: [({ type: "setValue", value: -1 })] })] } })';

    const w = bootRuntime(
      `<button id="special_button">Special</button>
       <button id="reset_btn">Reset</button>
       <input id="counter_element" data-nodelogic-id="counter_element" value="0" />`,
      FIXED_FORMULA
    );
    await wait(200);
    const counter = w.document.getElementById('counter_element');
    const click = (id) => w.document.getElementById(id).dispatchEvent(new w.Event('click', { bubbles: true }));

    click('special_button'); await wait(100);
    ok('2a) Special #1: 0 -> 1', counter.value === '1', counter.value);
    click('special_button'); await wait(100);
    ok('2b) Special #2 reads its OWN prior write, not frozen: 1 -> 2', counter.value === '2', counter.value);
    click('special_button'); await wait(100);
    ok('2c) Special #3: 2 -> 3', counter.value === '3', counter.value);

    click('reset_btn'); await wait(100);
    ok('2d) Reset: -> -1 (Special does not execute, does not block Reset)', counter.value === '-1', counter.value);

    click('special_button'); await wait(100);
    ok('2e) Special immediately after Reset reads Reset\'s effect, not a stale pre-reset value: -1 -> 0', counter.value === '0', counter.value);

    click('reset_btn'); await wait(100);
    ok('2f) Reset -> -1 again', counter.value === '-1', counter.value);
    click('special_button'); await wait(100);
    ok('2g) Special -> 0 again (repeated Special<->Reset does not corrupt either branch)', counter.value === '0', counter.value);
    click('special_button'); await wait(100);
    ok('2h) Special -> 1 (keeps incrementing on repeat, not stuck)', counter.value === '1', counter.value);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
