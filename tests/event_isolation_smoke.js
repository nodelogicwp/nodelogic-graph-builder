/* Event isolation regression suite.
 *
 * REPORTED BUG: "I have two separate Event nodes: Event A -> Special Button,
 * Event B -> Reset Button. When I click the Special Button, the graph for
 * the Reset Button can execute instead. It looks like the most recently
 * created Event is somehow taking over events that belong to other Event
 * nodes."
 *
 * ROOT CAUSE (traced editor graph -> compiled expression -> runtime
 * registration -> listener identity -> dispatch -> execution):
 * `window.nodelogicActionBindings` is one GLOBAL, page-wide registry. Its key
 * (`entryKey`) is derived ONLY from an Output node's own internal graph id
 * (` nlOutEl:<id>` / ` nlOutTarget:<id>`) -- unique WITHIN one graph, but NOT
 * across separate logic blocks/widgets. Two widgets built from the same saved
 * template (or a duplicated/copied Elementor widget) keep identical internal
 * node ids, so their Output nodes' entryKeys collide in that one global
 * registry: both share a single bindingState slot. Each block's own
 * "did my target change" check (`bindingState.target !== target`) then
 * misfires against the OTHER block's different target, tearing the listener
 * down and rebuilding it on every recalculation. Because both outputs use
 * wired Element pins (`holdsLiveElement` => never cached => always a "fresh"
 * evaluation), this teardown/rebuild races on EVERY applyLogicBlocks() pass.
 * Blocks are always processed in the same fixed document order, so whichever
 * block is processed LAST every pass permanently "wins" -- exactly
 * "the most recently created/processed Event steals the other's target."
 *
 * FIX (round 1): every logic block computes a `blockScope` from the block's
 * own `data-editor-id` (rendered by integrations.php /
 * logic-render-elementor.php / logic-render.php for every widget instance)
 * and prefixes every nodelogicActionBindings / activeActionTargets /
 * removeActionBinding key with it: `bindingKey = ${blockScope}::${entryKey}`.
 * entryKey itself (used for the `__targetId` DOM-target lookup) is untouched.
 * This closes the collision for two INDEPENDENTLY authored widgets.
 *
 * STILL BROKEN after round 1 -- the actual real-world reproduction: a
 * widget duplicated via Elementor's native "Duplicate" (or a saved template
 * inserted twice, or a global/synced widget). Elementor's duplicate clones
 * the widget's ENTIRE settings object verbatim, including our own
 * already-persisted `editor_id` (assets/elementor/elementor-logic.js's
 * getGraphData only (re)computed it `if (!editorId)` -- never for a
 * settings blob copied from another widget). Two widgets produced that way
 * share the SAME data-editor-id (on top of already sharing identical
 * internal graph node ids, since duplicating doesn't touch the serialized
 * graph_state), so round 1's blockScope collapses right back into one
 * shared binding slot -- confirmed empirically (see section 5c/5d/5e below).
 *
 * FIX (round 2, the actual fix): blockScope now ALWAYS folds in the block's
 * own fixed position among `DOM.logicBlocks` for the current page load,
 * not merely as a fallback for a missing editor id:
 * `blockScope = ${editorId || "noid"}#${blockIndex}`. Two rendered blocks
 * on one page always occupy distinct positions no matter what their
 * (possibly duplicated) data-editor-id says, so this closes the gap
 * unconditionally -- it protects already-published pages immediately, with
 * no dependency on the editor-side fix having landed or the page being
 * resaved. The editor-side fix (elementor-logic.js: self-heal `editor_id`
 * whenever it doesn't match the widget's OWN current container id, which
 * Elementor regenerates on duplicate) was also applied, as defense in depth
 * for FUTURE saves, but is not exercised by this suite (it only runs inside
 * the actual Elementor editor UI, not the compiled-bundle harness used
 * here).
 *
 * INCIDENTAL FIX found while instrumenting this bug: `removeActionBinding`
 * trimmed its key (`toSafeString(targetId).trim()`), but entryKey values for
 * Element-pin-driven / __targetId-based outputs are deliberately
 * SPACE-PREFIXED (" nlOutEl:<id>" / " nlOutTarget:<id>") so they can never
 * collide with a plain dropdown target-id string. The trim made
 * removeActionBinding permanently miss every such entry -- its
 * listeners/removers were NEVER torn down (an independent event-listener
 * leak, not the hijacking bug itself, but it masked the oscillation while
 * debugging since old listeners technically stayed attached).
 *
 * Section 1 below uses `action-event` (the node that attaches an event +
 * action chain to an Output -- this is the "Event node" the report and the
 * historical reproduction scripts (repro_hijack_*.js) refer to, and the
 * exact mechanism `nodelogicActionBindings` bookkeeps).
 *
 * Section 2 investigates the SEPARATE Element-pin / no-ID-element work
 * (event-element / event-hover / event-scroll / event-id, which are VALUE
 * sources feeding window.eventStore + event-processor, an entirely different
 * registry) INDEPENDENTLY rather than assuming a shared root cause -- tracing
 * showed no relationship: window.eventStore and window.eventProcessorConsumed
 * are keyed by the real (or generated-but-stable) DOM target id, not a graph
 * node id, so they were never susceptible to section 1's collision.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const FRONT = fs.readFileSync(path.join(ROOT, 'frontend.js'), 'utf8');
const CSSP = 'window.CSS=window.CSS||{escape:function(x){return String(x).replace(/[^a-zA-Z0-9_-]/g,function(c){return "\\\\"+c;});}};';

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeEditorWindow() {
  const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.scrollTo = () => {};
  const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
  return w;
}
async function compile(elements, connections) {
  const g = { elements, connections, formula: '', updatedAt: 0 };
  const ew = makeEditorWindow();
  const fcalls = [];
  ew.mountElementorLogicEditor(ew.document.getElementById('host'), {
    editorId: 'e', graphState: g, onStateChange: () => {}, onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(500);
  const b = Array.from(ew.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
  b.click();
  await wait(300);
  return fcalls[fcalls.length - 1];
}
function bootPage(bodyHtml, blocks) {
  // blocks: [{ id, editorId, formula }]
  const blockHtml = blocks.map((b) => `<div data-nodelogic-logic="1" id="${b.id}" data-editor-id="${b.editorId}" data-output-configs="{}" style="display:none"></div>`).join('\n');
  const html = `<!doctype html><body>${bodyHtml}\n${blockHtml}\n</body>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(CSSP);
  let rafId = 1;
  w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
  w.cancelAnimationFrame = () => {};
  blocks.forEach((b) => w.document.getElementById(b.id).setAttribute('data-formula', b.formula));
  const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return w;
}

// Event A (action-event) -> targetBtnId -> action A -> sinkId, as ONE
// logic block's graph. Mirrors the historical repro_hijack_*.js shape and
// the real "Event node -> action" pattern the report describes.
function eventActionGraph(targetBtnId, actionText, sinkId, eventType) {
  return {
    elements: [
      mk('elrefSrc', 'element-ref', { elementUseManualId: true, customElementId: targetBtnId }),
      mk('eventNode', 'action-event', { actionEventType: eventType || 'click' }),
      mk('setAction', 'action-set-text', { valueText: actionText }),
      mk('elrefOut', 'element-ref', { elementUseManualId: true, customElementId: sinkId }),
      mk('out', 'output', { outputTargetElementPin: true }),
    ],
    connections: [
      cn('a', 'elrefSrc', 'output0', 'eventNode', 'input1'),
      cn('b', 'eventNode', 'output0', 'setAction', 'input0'),
      cn('c', 'elrefOut', 'output0', 'out', 'input0'),
      cn('d', 'out', 'output0', 'eventNode', 'input0'),
    ],
  };
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 300000);

(async () => {
  /* ============================================================
   * SECTION 1 -- Event / action binding isolation (the reported bug).
   * Real editor bundle -> Save -> real frontend.js runtime throughout.
   * ============================================================ */

  const bodyHtml = `
    <button id="special-btn">Special</button>
    <button id="reset-btn">Reset</button>
    <div id="sinkA" data-nodelogic-id="sinkA">-</div>
    <div id="sinkB" data-nodelogic-id="sinkB">-</div>`;

  // 1: the EXACT reported graph -- Event A -> Special Button -> action A
  // (sinkA), Event B -> Reset Button -> action B (sinkB), each its own
  // widget/logic block, SAME internal node ids in both graphs (as a
  // duplicated/templated widget keeps) -- this is the precise shape that
  // reproduced the bug. Click both buttons repeatedly, alternating and
  // repeating, and prove isolation holds throughout (covers requirements
  // "two independent Event nodes", "repeated executions remain isolated",
  // and "same event type, different targets").
  {
    const gA = eventActionGraph('special-btn', 'A-hit', 'sinkA');
    const gB = eventActionGraph('reset-btn', 'B-hit', 'sinkB');
    const formulaA = await compile(gA.elements, gA.connections);
    const formulaB = await compile(gB.elements, gB.connections);

    const w = bootPage(bodyHtml, [
      { id: 'lbA', editorId: 'widget-A', formula: formulaA },
      { id: 'lbB', editorId: 'widget-B', formula: formulaB },
    ]);
    await wait(100);
    const special = w.document.getElementById('special-btn');
    const reset = w.document.getElementById('reset-btn');
    const sinkA = w.document.getElementById('sinkA');
    const sinkB = w.document.getElementById('sinkB');

    const clickAndCheck = async (label, el, expectA, expectB) => {
      sinkA.textContent = '-'; sinkB.textContent = '-';
      el.dispatchEvent(new w.Event('click', { bubbles: true }));
      await wait(80);
      ok(`1) ${label}: sinkA=${expectA} sinkB=${expectB}`,
        sinkA.textContent === expectA && sinkB.textContent === expectB,
        `sinkA=${sinkA.textContent} sinkB=${sinkB.textContent}`);
    };

    // Repeated, interleaved, alternating clicks -- isolation must hold on
    // every single execution, not just the first.
    await clickAndCheck('Special click #1', special, 'A-hit', '-');
    await clickAndCheck('Reset click #1', reset, '-', 'B-hit');
    await clickAndCheck('Special click #2', special, 'A-hit', '-');
    await clickAndCheck('Special click #3 (repeat, same target)', special, 'A-hit', '-');
    await clickAndCheck('Reset click #2', reset, '-', 'B-hit');
    await clickAndCheck('Reset click #3 (repeat, same target)', reset, '-', 'B-hit');
    await clickAndCheck('Special click #4 (after Reset settled)', special, 'A-hit', '-');
  }

  // 2/3: Node-creation-order independence. lbA/lbB are the two logic blocks
  // processed in document order by DOM.logicBlocks.forEach -- swap which
  // widget's formula lands on which block between the two orderings and
  // confirm isolation is unaffected either way.
  {
    const gA = eventActionGraph('special-btn', 'A-hit', 'sinkA');
    const gB = eventActionGraph('reset-btn', 'B-hit', 'sinkB');
    const formulaA = await compile(gA.elements, gA.connections);
    const formulaB = await compile(gB.elements, gB.connections);

    // B processed first, A processed second.
    const w = bootPage(bodyHtml, [
      { id: 'lbA', editorId: 'widget-B-first', formula: formulaB },
      { id: 'lbB', editorId: 'widget-A-second', formula: formulaA },
    ]);
    await wait(100);
    const special = w.document.getElementById('special-btn');
    const reset = w.document.getElementById('reset-btn');
    const sinkA = w.document.getElementById('sinkA');
    const sinkB = w.document.getElementById('sinkB');

    sinkA.textContent = '-'; sinkB.textContent = '-';
    special.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('2) creation-order reversed (B processed before A): Special still only fires A',
      sinkA.textContent === 'A-hit' && sinkB.textContent === '-', `sinkA=${sinkA.textContent} sinkB=${sinkB.textContent}`);

    sinkA.textContent = '-'; sinkB.textContent = '-';
    reset.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('3) creation-order reversed (B processed before A): Reset still only fires B',
      sinkA.textContent === '-' && sinkB.textContent === 'B-hit', `sinkA=${sinkA.textContent} sinkB=${sinkB.textContent}`);
  }

  // 4: Two Event nodes, DIFFERENT event types, SAME target element.
  {
    const parentHtml = `<button id="shared-btn">Shared</button>
      <div id="sinkC" data-nodelogic-id="sinkC">-</div>
      <div id="sinkD" data-nodelogic-id="sinkD">-</div>`;
    const gClick = eventActionGraph('shared-btn', 'click-hit', 'sinkC', 'click');
    const gFocus = eventActionGraph('shared-btn', 'focus-hit', 'sinkD', 'focus');
    const formulaClick = await compile(gClick.elements, gClick.connections);
    const formulaFocus = await compile(gFocus.elements, gFocus.connections);

    const w = bootPage(parentHtml, [
      { id: 'lbA', editorId: 'widget-click', formula: formulaClick },
      { id: 'lbB', editorId: 'widget-focus', formula: formulaFocus },
    ]);
    await wait(100);
    const btn = w.document.getElementById('shared-btn');
    const sinkC = w.document.getElementById('sinkC');
    const sinkD = w.document.getElementById('sinkD');

    btn.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('4a) same target, different event types: click fires only the click-bound action',
      sinkC.textContent === 'click-hit' && sinkD.textContent === '-', `sinkC=${sinkC.textContent} sinkD=${sinkD.textContent}`);

    btn.dispatchEvent(new w.Event('focus', { bubbles: true }));
    await wait(80);
    ok('4b) same target, different event types: focus fires only the focus-bound action',
      sinkD.textContent === 'focus-hit', `sinkD=${sinkD.textContent}`);
  }

  // 5: compiled-level -- bindingKey is scoped per logic block (data-editor-id),
  // so two widgets sharing internal node ids get two DISTINCT registry
  // entries instead of colliding. Verified by direct instrumentation of
  // window.nodelogicActionBindings after boot.
  {
    const gA = eventActionGraph('special-btn', 'A-hit', 'sinkA');
    const gB = eventActionGraph('reset-btn', 'B-hit', 'sinkB');
    const formulaA = await compile(gA.elements, gA.connections);
    const formulaB = await compile(gB.elements, gB.connections);

    const blocks = [
      { id: 'lbA', editorId: 'widget-A', formula: formulaA },
      { id: 'lbB', editorId: 'widget-B', formula: formulaB },
    ];
    const blockHtml = blocks.map((b) => `<div data-nodelogic-logic="1" id="${b.id}" data-editor-id="${b.editorId}" data-output-configs="{}" style="display:none"></div>`).join('\n');
    const html = `<!doctype html><body>${bodyHtml}\n${blockHtml}\n</body>`;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(CSSP);
    let rafId = 1;
    w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
    w.cancelAnimationFrame = () => {};
    blocks.forEach((b) => w.document.getElementById(b.id).setAttribute('data-formula', b.formula));
    let src = FRONT;
    const marker = '\n})();';
    const idx = src.lastIndexOf(marker);
    src = src.slice(0, idx) + '\n;window.__DBG_bindings = window.nodelogicActionBindings;' + src.slice(idx);
    const s = w.document.createElement('script'); s.textContent = src; w.document.body.appendChild(s);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await wait(100);

    const keys = Object.keys(w.__DBG_bindings || {});
    ok('5a) two separate blockScope-prefixed binding keys exist (no collision)',
      keys.length === 2 && new Set(keys).size === 2, JSON.stringify(keys));
    ok('5b) each key is prefixed with its own widget\'s data-editor-id (+ block position)',
      keys.some((k) => k.startsWith('widget-A#')) && keys.some((k) => k.startsWith('widget-B#')),
      JSON.stringify(keys));
  }

  // 5c/5d/5e: STILL BROKEN after the blockScope fix above -- the exact
  // real-world workflow reported ("Special Button" vs "Close Button", two
  // Event nodes built by duplicating one widget in Elementor). Elementor's
  // native "Duplicate" (and inserting a saved template twice, and a
  // global/synced widget) clones the widget's ENTIRE settings object
  // verbatim, including our own already-persisted `editor_id`
  // (assets/elementor/elementor-logic.js's getGraphData only (re)computed it
  // `if (!editorId)` -- never for an already-duplicated settings blob) --
  // so BOTH widgets share the exact same data-editor-id on the frontend, on
  // top of already sharing identical internal graph node ids (duplicating
  // doesn't touch the serialized graph_state). blockScope alone (keyed only
  // by data-editor-id) collapses right back into one shared binding slot,
  // reproducing the original hijack. Confirmed via an instrumented
  // reproduction against the code as it stood after the FIRST blockScope
  // fix: clicking "Special" did nothing (its listener got torn down by the
  // later-processed "Close" block on every single recompute pass) while
  // "Close" kept working -- the same "last-processed block wins" symptom,
  // just triggered by a duplicated widget instead of two independently
  // authored ones.
  //
  // REAL FIX: blockScope now ALWAYS folds in this block's own fixed
  // position among DOM.logicBlocks for the current page load
  // (`${editorId || "noid"}#${blockIndex}`), not merely as a fallback for a
  // missing editor id. Two rendered blocks on one page always have distinct
  // positions no matter what their (possibly duplicated) data-editor-id
  // says, so this closes the gap without depending on the editor-side fix
  // ever landing or an already-published page ever being resaved.
  {
    const gA = eventActionGraph('special-btn', 'A-hit', 'sinkA');
    // "Duplicate" in the real world only changes target/text DATA -- the
    // internal node ids stay identical, matching gA's shape exactly.
    const gB = {
      elements: gA.elements.map((el) => {
        if (el.id === 'elrefSrc') return { ...el, data: { ...el.data, customElementId: 'close-btn' } };
        if (el.id === 'setAction') return { ...el, data: { ...el.data, valueText: 'B-hit' } };
        if (el.id === 'elrefOut') return { ...el, data: { ...el.data, customElementId: 'sinkB' } };
        return el;
      }),
      connections: gA.connections,
    };
    const formulaA = await compile(gA.elements, gA.connections);
    const formulaB = await compile(gB.elements, gB.connections);

    // SAME data-editor-id on both blocks -- exactly what Elementor's native
    // "Duplicate" produces (a cloned, not-yet-diverged settings.editor_id).
    const duplicateBodyHtml = `
      <button id="special-btn">Special</button>
      <button id="close-btn">Close</button>
      <div id="sinkA" data-nodelogic-id="sinkA">-</div>
      <div id="sinkB" data-nodelogic-id="sinkB">-</div>`;
    const html = `<!doctype html><body>${duplicateBodyHtml}
      <div data-nodelogic-logic="1" id="lbA" data-editor-id="nodelogic-elementor-e111" data-output-configs="{}" style="display:none"></div>
      <div data-nodelogic-logic="1" id="lbB" data-editor-id="nodelogic-elementor-e111" data-output-configs="{}" style="display:none"></div>
    </body>`;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(CSSP);
    let rafId = 1;
    w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
    w.cancelAnimationFrame = () => {};
    w.document.getElementById('lbA').setAttribute('data-formula', formulaA);
    w.document.getElementById('lbB').setAttribute('data-formula', formulaB);
    const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await wait(100);

    const special = w.document.getElementById('special-btn');
    const close = w.document.getElementById('close-btn');
    const sinkA = w.document.getElementById('sinkA');
    const sinkB = w.document.getElementById('sinkB');

    sinkA.textContent = '-'; sinkB.textContent = '-';
    special.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('5c) DUPLICATED widget (same data-editor-id AND same node ids): clicking Special fires only A, not Close\'s action',
      sinkA.textContent === 'A-hit' && sinkB.textContent === '-', `sinkA=${sinkA.textContent} sinkB=${sinkB.textContent}`);

    sinkA.textContent = '-'; sinkB.textContent = '-';
    close.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('5d) DUPLICATED widget: clicking Close fires only B',
      sinkA.textContent === '-' && sinkB.textContent === 'B-hit', `sinkA=${sinkA.textContent} sinkB=${sinkB.textContent}`);

    // Repeat, alternating, several times -- must stay isolated on every pass.
    sinkA.textContent = '-'; sinkB.textContent = '-';
    special.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('5e) DUPLICATED widget: Special still works correctly after Close has already fired once',
      sinkA.textContent === 'A-hit' && sinkB.textContent === '-', `sinkA=${sinkA.textContent} sinkB=${sinkB.textContent}`);
  }

  /* ============================================================
   * SECTION 2 -- Element input pin audit (event-element, event-hover,
   * event-scroll, event-id) + no-ID element support. Investigated and
   * verified INDEPENDENTLY of section 1 -- see file header.
   * ============================================================ */

  // 6/7: Element pin connected takes precedence; unconnected preserves the
  // existing ID-control fallback -- for each of the four event-source nodes.
  // Each evt node is wired into an Output's value pin purely to force it
  // into the compiled formula (these nodes have no compiled representation
  // at all unless something downstream consumes their value).
  for (const evtType of ['event-element', 'event-id', 'event-hover', 'event-scroll']) {
    const wiredEls = [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'wired-target' }),
      mk('evt', evtType, evtType === 'event-hover' ? { eventHoverMode: 'enter' } : {}),
      mk('out', 'output', { selectedElement: 'sink-compile' }),
    ];
    const wiredConns = [
      cn('a', 'elref', 'output0', 'evt', 'input0'),
      cn('b', 'evt', 'output0', 'out', 'input0'),
    ];
    const fWired = await compile(wiredEls, wiredConns);
    const wiredFn = evtType === 'event-hover' ? '__nodeHoverEvent' : '__nodeEvent';
    ok(`6) ${evtType}: connected Element pin wins (__nodeGetElement("wired-target") reaches ${wiredFn})`,
      fWired.includes('__nodeGetElement("wired-target")') && fWired.includes(wiredFn),
      fWired);

    const fallbackData = evtType === 'event-hover' || evtType === 'event-scroll'
      ? { selectedElement: 'fallback-target', eventHoverMode: 'enter' }
      : { eventElement: 'fallback-target' };
    const fFallback = await compile(
      [mk('evt', evtType, fallbackData), mk('out', 'output', { selectedElement: 'sink-compile' })],
      [cn('a', 'evt', 'output0', 'out', 'input0')]
    );
    ok(`7) ${evtType}: unconnected pin preserves the existing ID-control fallback ("fallback-target")`,
      fFallback.includes('"fallback-target"'), fFallback);
  }

  // 8: Element Reference / Element-returning nodes must NOT expose an
  // Element input pin (element-ref, element-id, legacy element).
  {
    const w = makeEditorWindow();
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
      editorId: 'e',
      graphState: {
        elements: [mk('r', 'element-ref', {}), mk('i', 'element-id', {}), mk('l', 'element', {})],
        connections: [], formula: '', updatedAt: 0,
      },
      onStateChange: () => {}, onFormulaChange: () => {},
    });
    await wait(500);
    for (const id of ['r', 'i', 'l']) {
      const card = w.document.querySelector(`[data-element-id="${id}"]`);
      const pins = card ? card.querySelectorAll('.pin.input, [class*="pin-input"]') : null;
      ok(`8) ${id}: Element-returning node exposes no input pin`,
        !card || !pins || pins.length === 0, card ? card.outerHTML.slice(0, 150) : 'no card');
    }
  }

  // Shared graph builder for 9/10/11: Get Element -> Get Children (single,
  // no id on the child) -> event-element's Element pin -> Event Processor
  // (passOnlyOnEvent) -> Fallback(0) -> Output.value. Clicking the id-less
  // child element flips the Output's target from '0' to '1'.
  function noIdChildGraph(parentId, childIndex, sinkId) {
    return {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: parentId }),
        mk('gc', 'get-children', { getChildrenMode: 'single', getChildrenSingleIndex: childIndex }),
        mk('evt', 'event-element', { eventType: 'click' }),
        mk('one', 'number', { value: 1 }),
        mk('eventProc', 'event-processor', { passOnlyOnEvent: true }),
        mk('fallback', 'fallback', {}),
        mk('zero', 'number', { value: 0 }),
        mk('out', 'output', { selectedElement: sinkId }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'gc', 'input0'),
        cn('b', 'gc', 'output0', 'evt', 'input0'),
        cn('c0', 'evt', 'output0', 'eventProc', 'input0'),
        cn('c1', 'one', 'output0', 'eventProc', 'input1'),
        cn('c2', 'eventProc', 'output0', 'fallback', 'input0'),
        cn('c3', 'zero', 'output0', 'fallback', 'input1'),
        cn('d', 'fallback', 'output0', 'out', 'input0'),
      ],
    };
  }

  // 9: A child Element with NO id attribute, reached via Get Element -> Get
  // Children (single) -> wired straight into event-element's Element pin,
  // is fully operable -- no manual id assignment anywhere in the graph.
  {
    const g = noIdChildGraph('parent-noid', 0, 'sink-noid');
    const f = await compile(g.elements, g.connections);
    const w = bootPage(
      `<div id="parent-noid"><span>no-id-child</span></div><div id="sink-noid" data-nodelogic-id="sink-noid">unset</div>`,
      [{ id: 'lb', editorId: 'w', formula: f }]
    );
    await wait(100);
    const child = w.document.querySelector('#parent-noid span');
    ok('9a) the child element genuinely has no id attribute', !child.id, child.outerHTML);
    child.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('9b) clicking the id-less child fires its bound action via the Element pin',
      w.document.getElementById('sink-noid').textContent === '1',
      w.document.getElementById('sink-noid').textContent);
  }

  // 10/11: Generated-id stability + uniqueness for id-less elements.
  // Two DIFFERENT id-less children of the same parent, each independently
  // wired through its own event-element node -- a generated id must never
  // be shared between different elements (10, cross-fire check), and must
  // be STABLE across repeated recalculation passes: an unstable id would
  // cause window.eventStore's registry lookup to miss every pass, so the
  // listener would be re-registered (addEventListener called again) on
  // every recompute instead of exactly once (11, add-count check).
  {
    const g0 = noIdChildGraph('multi-parent', 0, 'sink0');
    const g1 = noIdChildGraph('multi-parent', 1, 'sink1');
    const f0 = await compile(g0.elements, g0.connections);
    const f1 = await compile(g1.elements, g1.connections);

    const html = `<!doctype html><body>
      <div id="multi-parent"><span class="c0">first</span><span class="c1">second</span></div>
      <div id="sink0" data-nodelogic-id="sink0">unset</div>
      <div id="sink1" data-nodelogic-id="sink1">unset</div>
      <div data-nodelogic-logic="1" id="lb0" data-editor-id="leg0" data-output-configs="{}" style="display:none"></div>
      <div data-nodelogic-logic="1" id="lb1" data-editor-id="leg1" data-output-configs="{}" style="display:none"></div>
    </body>`;
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://site.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(CSSP);
    let rafId = 1;
    w.requestAnimationFrame = (cb) => { const id = rafId++; setTimeout(() => cb(performance.now()), 0); return id; };
    w.cancelAnimationFrame = () => {};
    w.document.getElementById('lb0').setAttribute('data-formula', f0);
    w.document.getElementById('lb1').setAttribute('data-formula', f1);

    const c0 = w.document.querySelector('.c0');
    const c1 = w.document.querySelector('.c1');
    const addCounts = { c0: 0, c1: 0 };
    [['c0', c0], ['c1', c1]].forEach(([key, el]) => {
      const origAdd = el.addEventListener.bind(el);
      el.addEventListener = (type, listener, opts) => {
        if (type === 'click') addCounts[key]++;
        return origAdd(type, listener, opts);
      };
    });

    const s = w.document.createElement('script'); s.textContent = FRONT; w.document.body.appendChild(s);
    w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
    await wait(100);

    // 10: uniqueness -- clicking child 0 must fire ONLY sink0, never sink1.
    c0.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('10a) id-less child 0 click fires only its own action (sink0); sink1 stays at its unfired fallback (0)',
      w.document.getElementById('sink0').textContent === '1' && w.document.getElementById('sink1').textContent === '0',
      `sink0=${w.document.getElementById('sink0').textContent} sink1=${w.document.getElementById('sink1').textContent}`);

    // reciprocal: clicking child 1 must fire ONLY sink1.
    c1.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('10b) id-less child 1 click fires only its own action (sink1), no cross-fire from child 0\'s generated id',
      w.document.getElementById('sink1').textContent === '1',
      w.document.getElementById('sink1').textContent);

    // 11: stability -- repeated recomputation passes (repeated clicks
    // trigger applyLogicBlocks() re-evaluation) must NOT re-register the
    // listener; each element's generated id must resolve to the SAME
    // window.eventStore entry every time.
    c0.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(60);
    c1.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(60);
    c0.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(60);
    ok(`11) generated id is stable across recomputation: addEventListener('click') called exactly once per id-less child (got c0=${addCounts.c0}, c1=${addCounts.c1})`,
      addCounts.c0 === 1 && addCounts.c1 === 1, JSON.stringify(addCounts));
  }

  /* ============================================================
   * SECTION 3 -- "Close Event disconnected from its payload" report.
   *
   * User's strongest reproduction: ONE single graph/widget containing
   * Special Event -> own payload -> Output1 (fully wired) AND Close Event
   * -> Output2, where Close Event's OWN payload chain is disconnected
   * (nothing wired to closeEvent's output). Clicking Special must be
   * incapable of executing anything belonging to Close's (disconnected)
   * branch -- there is no connection from Special's event to Close's
   * payload for it to travel through.
   *
   * Traced with full instrumentation (event node id, target, type, action
   * node ids, resolved source element, exact actions array selected) on
   * the real editor bundle + real frontend.js: Close's compiled entry
   * carries `actions: []` (its own payload chain is genuinely absent from
   * the compiled output, not merely present-but-inert), so
   * registerActionListeners' own early-return
   * (`if (!sourceEl || nestedActions.length === 0) return;`) means NO
   * listener is ever registered for it at all -- there is nothing for
   * Special's click to reach. This held across every graph shape tried
   * this session (single- and multi-block, action-event and
   * event-processor/memory chains) -- see also section 1's "same
   * data-editor-id AND same node ids" duplicate-widget case (5c/5d/5e) and
   * section 1's basic two-widget case (1).
   * ============================================================ */
  {
    const elements = [
      mk('elrefSpecial', 'element-ref', { elementUseManualId: true, customElementId: 'special-btn' }),
      mk('specialEvent', 'action-event', { actionEventType: 'click' }),
      mk('setTextSpecial', 'action-set-text', { valueText: 'SPECIAL-HIT' }),
      mk('elrefOut1', 'element-ref', { elementUseManualId: true, customElementId: 'sink1' }),
      mk('out1', 'output', { outputTargetElementPin: true }),

      mk('elrefClose', 'element-ref', { elementUseManualId: true, customElementId: 'close-btn' }),
      mk('closeEvent', 'action-event', { actionEventType: 'click' }),
      // Deliberately orphaned: setTextClose exists in the graph but has NO
      // connection from closeEvent -- "Close Event disconnected from its
      // payload."
      mk('setTextClose', 'action-set-text', { valueText: 'CLOSE-HIT' }),
      mk('elrefOut2', 'element-ref', { elementUseManualId: true, customElementId: 'sink2' }),
      mk('out2', 'output', { outputTargetElementPin: true }),
    ];
    const connections = [
      cn('a', 'elrefSpecial', 'output0', 'specialEvent', 'input1'),
      cn('b', 'specialEvent', 'output0', 'setTextSpecial', 'input0'),
      cn('c', 'elrefOut1', 'output0', 'out1', 'input0'),
      cn('d', 'out1', 'output0', 'specialEvent', 'input0'),

      cn('e', 'elrefClose', 'output0', 'closeEvent', 'input1'),
      // NO connection: closeEvent.output0 -> setTextClose.input0
      cn('f', 'elrefOut2', 'output0', 'out2', 'input0'),
      cn('g', 'out2', 'output0', 'closeEvent', 'input0'), // Close Event still attached to Output2, payload is not
    ];

    const formula = await compile(elements, connections);
    ok('12a) compiled: Close Event\'s entry carries an EMPTY actions array (its disconnected payload is genuinely absent, not just unreachable)',
      /"__nodeId":\s*"closeEvent"[^}]*"actions":\s*\[\]/.test(formula), formula);
    ok('12b) compiled: Special\'s entry still carries its own setText payload',
      /"__nodeId":\s*"specialEvent"[\s\S]*?"actions":\s*\[[\s\S]*?"setText"/.test(formula), formula);

    const w = bootPage(
      `<button id="special-btn">Special</button><button id="close-btn">Close</button>
       <div id="sink1" data-nodelogic-id="sink1">-</div>
       <div id="sink2" data-nodelogic-id="sink2">-</div>`,
      [{ id: 'lb', editorId: 'widget-single', formula }]
    );
    await wait(100);
    const special = w.document.getElementById('special-btn');
    const sink1 = w.document.getElementById('sink1');
    const sink2 = w.document.getElementById('sink2');

    special.dispatchEvent(new w.Event('click', { bubbles: true }));
    await wait(80);
    ok('12c) clicking Special fires ONLY Special\'s own payload (sink1) -- Close\'s disconnected payload (sink2) never executes',
      sink1.textContent === 'SPECIAL-HIT' && sink2.textContent === '-',
      `sink1=${sink1.textContent} sink2=${sink2.textContent}`);

    // Repeat a few times -- must stay correct on every recomputation pass,
    // not just the first.
    for (let i = 0; i < 3; i++) {
      sink1.textContent = '-'; sink2.textContent = '-';
      special.dispatchEvent(new w.Event('click', { bubbles: true }));
      await wait(60);
      ok(`12d) repeat click #${i + 1}: still isolated (sink1="SPECIAL-HIT", sink2="-")`,
        sink1.textContent === 'SPECIAL-HIT' && sink2.textContent === '-',
        `sink1=${sink1.textContent} sink2=${sink2.textContent}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
