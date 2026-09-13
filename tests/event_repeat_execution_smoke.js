/* Event node "stops after first execution" — release blocker.
 *
 * Root cause (see RELEASE_CHECKLIST.md / the audit report for full detail):
 *
 *   1. `formulaEvaluationCache`'s key (`valuesSignature`, from
 *      getAllDynamicValues()) never reflected any event's triggeredCount, so
 *      a logic block's formula was evaluated once per distinct
 *      (formula, site-wide-control-state) pair and then reused FOREVER for
 *      that state -- a repeating event whose OTHER page state stayed the
 *      same silently replayed a single stale, frozen evaluation.
 *   2. Even once freshly (re-)evaluated, applyLogicBlocks gated re-running an
 *      output's action plan on "has its JSON content changed since I last
 *      applied it" -- which is false for the overwhelmingly common case of a
 *      repeating event producing an IDENTICAL result (a click that always
 *      sets the same text, always toggles the same class, ...), silently
 *      dropping every occurrence after the first matching one.
 *   3. `isPreparedExpressionSafe`'s identifier whitelist was missing several
 *      action-node keys used by the compiler (condition/trueActions/
 *      falseActions for Action If; name/property/mode/message/duration/
 *      target/url for Set Attribute/Style/Visibility/Notify/Redirect/Trigger
 *      Event) -- any formula using them was rejected outright (not a "stops
 *      after first" bug, a "never works" bug for those action types; fixed
 *      alongside since it blocked testing #1/#2 with Action If).
 *
 * This suite exercises the REAL, rAF-debounced production pipeline
 * (scheduleRecalculation -> requestAnimationFrame -> recalculateAll ->
 * applyLogicBlocks), which no prior suite polyfilled requestAnimationFrame
 * for -- that gap is exactly why this class of bug went uncaught.
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

/** Boots frontend.js in a real, rAF-debounced jsdom window. `expose` is an
 * object-literal fragment of internals to attach to window.__DBG. */
function boot(bodyHtml, formula, expose) {
  const html = `<!doctype html><body>${bodyHtml}
    <div data-nodelogic-logic="1" id="lb" data-output-configs="{}" style="display:none"></div>
  </body>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  // jsdom has no requestAnimationFrame; scheduleRecalculation() depends on a
  // real one in production. Polyfill it as a real browser would schedule one
  // (a macrotask), so this suite exercises the actual debounced pipeline
  // instead of bypassing it.
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  w.document.getElementById('lb').setAttribute('data-formula', formula);

  let src = FRONT;
  const marker = '\n})();';
  const idx = src.lastIndexOf(marker);
  src = src.slice(0, idx) + `\n;window.__DBG = { ${expose || ''} };` + src.slice(idx);
  const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return w;
}

const click = (w, el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));
const input = (w, el) => el.dispatchEvent(new w.Event('input', { bubbles: true }));

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  /* ================================================================
   * 0. Whitelist gap: Action If / Set Attribute / Set Style /
   *    Set Visibility / Notify / Redirect / Trigger Event must parse
   *    and evaluate (were previously rejected as "unsafe").
   * ================================================================ */
  {
    const w = boot('<div></div>', '1', 'evaluateFormulaExpression: evaluateFormulaExpression');
    const T = w.__DBG;
    const cases = [
      ['actionIf', `({ type: "actionIf", condition: true, trueActions: [], falseActions: [] })`],
      ['setAttribute', `({ type: "setAttribute", name: "data-x", value: "1" })`],
      ['setStyle', `({ type: "setStyle", property: "color", value: "red" })`],
      ['visibility', `({ type: "visibility", mode: "show" })`],
      ['notify', `({ type: "notify", message: "hi", duration: 1000 })`],
      ['redirect', `({ type: "redirect", target: "_self", url: "https://x.test" })`],
      ['triggerEvent', `({ type: "triggerEvent", name: "custom-evt" })`],
    ];
    cases.forEach(([label, expr]) => {
      const r = T.evaluateFormulaExpression(expr, {});
      ok(`0) "${label}" action-plan expression is valid (allowedIdentifiers)`, r.valid === true, JSON.stringify(r));
    });
  }

  /* ================================================================
   * 1. THE regression: 3+ consecutive identical-content occurrences of
   *    the SAME event must all take effect (setText, direct from an
   *    Event Processor, no Action If wrapper -- the simplest real shape).
   * ================================================================ */
  {
    const w = boot(
      '<button id="btn">Click</button><div id="sink">x</div>',
      `({ "sink": { "actions": [ ({ type: "setText", value: __nodeEventProcessor(__nodeEvent("btn","click"), "Clicked!", true) }) ] } })`
    );
    await wait(60);
    const sink = w.document.getElementById('sink');
    const btn = w.document.getElementById('btn');
    for (let i = 1; i <= 4; i++) {
      sink.textContent = `unset-${i}`;
      click(w, btn);
      await wait(60);
      ok(`1) click #${i}: Set Text re-applies "Clicked!" (listener still functional)`, sink.textContent === 'Clicked!', sink.textContent);
    }
  }

  /* ================================================================
   * 2. Toggle Class must flip every occurrence, not freeze after the
   *    first (its config is 100% static across every click, so it was
   *    the most exposed shape of the action-plan-signature bug).
   * ================================================================ */
  {
    const w = boot(
      '<button id="btn2">Click</button><div id="sink2"></div>',
      `({ "sink2": { "actions": [ ({ type: "actionIf",
          condition: __nodeEventProcessor(__nodeEvent("btn2","click"), true, true),
          trueActions: [ ({ type: "toggleClass", className: "on" }) ],
          falseActions: []
      }) ] } })`
    );
    await wait(60);
    const sink = w.document.getElementById('sink2');
    const btn = w.document.getElementById('btn2');
    const states = [];
    for (let i = 0; i < 4; i++) {
      click(w, btn);
      await wait(60);
      states.push(sink.classList.contains('on'));
    }
    ok('2) toggleClass flips on every click across 4 consecutive events (not frozen after #1)',
      JSON.stringify(states) === JSON.stringify([true, false, true, false]), JSON.stringify(states));
  }

  /* ================================================================
   * 3. Listener idempotency: an Action->Event nested binding fires
   *    exactly once per real occurrence across 5 consecutive events --
   *    proves recovering from the "signature unchanged" gate did not
   *    reintroduce duplicate listener registration.
   * ================================================================ */
  {
    const w = boot(
      '<button id="src3">Click</button><div id="sink3">0</div>',
      `({ "sink3": { "actions": [ ({ type: "event", sourceId: "src3", eventType: "click", actions: [ ({ type: "setAttribute", name: "data-count", value: "hit" }) ] }) ] } })`
    );
    await wait(60);
    const src = w.document.getElementById('src3');
    const sink = w.document.getElementById('sink3');
    let setAttrCalls = 0;
    const original = sink.setAttribute.bind(sink);
    sink.setAttribute = (...args) => { if (args[0] === 'data-count') setAttrCalls++; return original(...args); };
    for (let i = 0; i < 5; i++) {
      click(w, src);
      await wait(30);
    }
    ok('3) nested Action->Event fires exactly once per click across 5 clicks (no duplicate registration)',
      setAttrCalls === 5, `setAttrCalls=${setAttrCalls}`);
  }

  /* ================================================================
   * 4. No spurious re-fire: a one-shot action (toggleClass) must NOT
   *    re-apply on an UNRELATED recalculation (some other tracked
   *    control changing) when its own event has not recurred -- the
   *    fix for #1/#2 must not turn every recalc into a re-fire.
   * ================================================================ */
  {
    const w = boot(
      `<button id="btn4">Click</button>
       <div class="slider-container"><input id="unrelated4" type="text" value="a" /></div>
       <div id="sink4"></div>`,
      `({ "sink4": { "actions": [ ({ type: "actionIf",
          condition: __nodeEventProcessor(__nodeEvent("btn4","click"), true, true),
          trueActions: [ ({ type: "toggleClass", className: "on" }) ],
          falseActions: []
      }) ] } })`
    );
    await wait(60);
    const sink = w.document.getElementById('sink4');
    const btn = w.document.getElementById('btn4');
    const unrelated = w.document.getElementById('unrelated4');

    click(w, btn);
    await wait(60);
    ok('4a) click -> toggles on', sink.classList.contains('on'), String(sink.classList.contains('on')));

    for (let i = 0; i < 3; i++) {
      unrelated.value = `val-${i}`;
      input(w, unrelated);
      await wait(60);
      ok(`4b) unrelated recalc #${i + 1} does not spuriously re-toggle`, sink.classList.contains('on'), String(sink.classList.contains('on')));
    }

    click(w, btn);
    await wait(60);
    ok('4c) a genuine 2nd click still toggles off', !sink.classList.contains('on'), String(sink.classList.contains('on')));
  }

  /* ================================================================
   * 5. Multiple event nodes / targets within one graph do not interfere.
   * ================================================================ */
  {
    const w = boot(
      '<button id="btnA">A</button><button id="btnB">B</button><div id="sinkA">-</div><div id="sinkB">-</div>',
      `({
        "sinkA": { "actions": [ ({ type: "setText", value: __nodeEventProcessor(__nodeEvent("btnA","click"), "A-hit", true) }) ] },
        "sinkB": { "actions": [ ({ type: "setText", value: __nodeEventProcessor(__nodeEvent("btnB","click"), "B-hit", true) }) ] }
      })`
    );
    await wait(60);
    const sinkA = w.document.getElementById('sinkA');
    const sinkB = w.document.getElementById('sinkB');
    const btnA = w.document.getElementById('btnA');
    const btnB = w.document.getElementById('btnB');

    sinkA.textContent = 'reset'; sinkB.textContent = 'reset';
    click(w, btnA);
    await wait(60);
    ok('5a) clicking A only updates sinkA', sinkA.textContent === 'A-hit' && sinkB.textContent === '', `${sinkA.textContent} / ${sinkB.textContent}`);

    sinkA.textContent = 'reset'; sinkB.textContent = 'reset';
    click(w, btnB);
    await wait(60);
    ok('5b) clicking B only updates sinkB', sinkB.textContent === 'B-hit' && sinkA.textContent === '', `${sinkA.textContent} / ${sinkB.textContent}`);

    sinkA.textContent = 'reset';
    click(w, btnA);
    await wait(60);
    ok('5c) event A still re-applies after event B fired in between', sinkA.textContent === 'A-hit', sinkA.textContent);
  }

  /* ================================================================
   * 6. Cleanup / reinitialization: flipping which Action->Event branch
   *    is active (driven by real events, like any graph condition would
   *    be) removes the stale branch's listener (no leak / no
   *    double-fire) and the newly-active branch's listener works; the
   *    original branch re-registers correctly when flipped back.
   * ================================================================ */
  {
    const w = boot(
      `<button id="srcX">X</button><button id="srcY">Y</button>
       <button id="flipToY">to Y</button><button id="flipToX">to X</button>
       <div id="sink6">-</div>`,
      `({ "sink6": { "actions": [ ({ type: "actionIf",
          condition: __nodeFallback(
            __nodeEventProcessor(__nodeEvent("flipToY","click"), false, true),
            __nodeFallback(__nodeEventProcessor(__nodeEvent("flipToX","click"), true, true), true)
          ),
          trueActions: [ ({ type: "event", sourceId: "srcX", eventType: "click", actions: [ ({ type: "setText", value: "X-hit" }) ] }) ],
          falseActions: [ ({ type: "event", sourceId: "srcY", eventType: "click", actions: [ ({ type: "setText", value: "Y-hit" }) ] }) ]
      }) ] } })`
    );
    await wait(60);
    const sink = w.document.getElementById('sink6');
    const srcX = w.document.getElementById('srcX');
    const srcY = w.document.getElementById('srcY');
    const flipToY = w.document.getElementById('flipToY');
    const flipToX = w.document.getElementById('flipToX');

    // X branch active by default.
    click(w, srcX);
    await wait(60);
    ok('6a) X branch active: click X binds+fires', sink.textContent === 'X-hit', sink.textContent);
    sink.textContent = 'reset';
    click(w, srcY);
    await wait(60);
    ok('6b) X branch active: click Y is a no-op (not bound)', sink.textContent === 'reset', sink.textContent);

    // Flip to the Y branch via a real event (as any graph condition would be).
    click(w, flipToY);
    await wait(60);

    sink.textContent = 'reset';
    click(w, srcX);
    await wait(60);
    ok('6c) after flipping to Y: click X no longer fires (stale listener removed)', sink.textContent === 'reset', sink.textContent);
    click(w, srcY);
    await wait(60);
    ok('6d) after flipping to Y: click Y fires', sink.textContent === 'Y-hit', sink.textContent);

    // Flip back to X -- must re-register cleanly, not be permanently broken.
    click(w, flipToX);
    await wait(60);
    sink.textContent = 'reset';
    click(w, srcY);
    await wait(60);
    ok('6e) flipped back to X: click Y no longer fires', sink.textContent === 'reset', sink.textContent);
    click(w, srcX);
    await wait(60);
    ok('6f) flipped back to X: click X fires again (reinitialized, not stuck)', sink.textContent === 'X-hit', sink.textContent);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
