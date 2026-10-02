/* Regression test for the UI/UX audit pass:
 *  1) Node card height: some node types render 2+ stacked config controls
 *     (radix select + pad-length input, delimiter + index input, etc.) but
 *     have only 1 pin row, so the old pin-count-only getNodeHeight fallback
 *     sized the card too short and the second control rendered past the
 *     bottom edge (number-to-base, string-split; css-unit had an explicit
 *     but now-too-small hand-tuned constant after adding its label).
 *  2) Control labels: several controls (API request/status Timeout,
 *     number-to-base Base/Minimum Digits, css-join input count, css-unit
 *     Value, api-field Field Type, api-list-mapper Match Mode/Item Type,
 *     string-split Delimiter/Part Index) had no persistent label — some used
 *     a `placeholder` as a stand-in, which disappears once the field's
 *     non-empty default value fills it in, leaving the control unlabeled.
 *  3) memory-read-boolean had a redundant free-text "Default Value" input
 *     writing the same field as the "Boolean Value" select right below it.
 *
 * Runs against the real built Elementor bundle (dist/build/elementor.js) in
 * jsdom, exactly like the other `real_editor_*` / `*_smoke` suites. Only the
 * card's inline `style.height` (an explicit px string, not layout-dependent)
 * and rendered text content are checked -- jsdom has no layout engine, so
 * actual pixel overflow can't be observed this way; this test instead locks
 * the height formula's output and the label text so neither regresses.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });

function makeWindow() {
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.scrollTo = () => {};
    const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
    return w;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function mountGraph(elements, connections = []) {
    const w = makeWindow();
    w.mountElementorLogicEditor(w.document.getElementById('host'), {
        editorId: 'e', graphState: { elements, connections, formula: '', updatedAt: 0 },
        onStateChange: () => {}, onFormulaChange: () => {},
    });
    await wait(450);
    return w;
}

const heightOf = (w, id) => {
    const el = w.document.querySelector(`[data-element-id="${id}"]`);
    if (!el) return null;
    return parseInt(el.style.height || '0', 10);
};

// Independent, DOM-derived lower bound: count the ACTUAL `.input-control`
// elements a node renders in its own card body (not the sidebar), which is a
// real, unbiased signal -- each one is CSS-locked to exactly 32px
// (style.css: `.canvas-element .input-control { height:32px !important }`).
// This does not reproduce getNodeHeight's own arithmetic (that would just be
// checking the formula against itself); it independently re-derives a floor
// from what actually got rendered and asserts the computed height clears it,
// per "make the calculation mathematically consistent with the rendered DOM
// structure" -- jsdom has no layout engine so this can't catch real pixel
// overflow, but it does catch "N controls rendered, height too small for N".
const minHeightForRenderedControls = (w, id) => {
    const el = w.document.querySelector(`[data-element-id="${id}"]`);
    if (!el) return 0;
    const controls = el.querySelectorAll('.input-control').length;
    const overhead = 44; // border(2*2) + paddingTop(16) + header(~8) + paddingBottom(16)
    return overhead + controls * 32;
};

(async () => {
    // --- 1) Card height accounts for stacked config controls, not just pins ---
    {
        const w = await mountGraph([
            mk('ntb', 'number-to-base', { parseRadix: 16, minLength: 4 }),
            mk('ss', 'string-split', { splitDelimiter: ',', splitIndex: 0 }),
            mk('sr', 'string-replace', { replaceFind: 'a', replaceWith: 'b' }),
            mk('np', 'number-parse', { parseRadix: 10 }),
            mk('out', 'output', { selectedElement: '' }),
        ]);
        const h = (id) => heightOf(w, id);
        ok('number-to-base card tall enough for Base+Minimum Digits (was 78px)', h('ntb') >= 140, `height=${h('ntb')}`);
        ok('string-split card tall enough for Delimiter+Part Index (was 78px)', h('ss') >= 140, `height=${h('ss')}`);
        ok('string-replace card tall enough for Find+Replace (was 78px)', h('sr') >= 100, `height=${h('sr')}`);
        // number-parse gained a 'Base of the text' label above its select (2026-10-01):
        // label row (17) + select (32) instead of the bare select's 78px card.
        ok('number-parse card fits its Base label + select (was a bare select, 78px)', h('np') === 103, `height=${h('np')}`);
        ok('output (unwired, common case) tall enough for target + both checkboxes (was 78px)', h('out') >= 130, `height=${h('out')}`);
    }

    // --- css-unit explicit constant bumped for its new "Value" label ---
    {
        const w = await mountGraph([mk('cu', 'css-unit', { cssUnitValue: '10', cssUnit: 'px' })]);
        ok('css-unit card grew to fit its new Value label', heightOf(w, 'cu') >= 130, `height=${heightOf(w, 'cu')}`);
    }

    // --- object-build: height must scale with the ACTUAL number of key-name
    // controls rendered (getConfigContentHeight computes exact pixels from
    // the real JSX structure: a label+select row plus one 32px input per key,
    // each with its own 4px gap -- not an abstract "row count" forced through
    // the pin-row unit). A node with 4 controls must be taller than one with
    // 1, and 8 taller still, by EXACTLY the per-key pixel cost (32px control
    // + 4px gap = 36px/key), proving the formula tracks real content. ---
    {
        const w = await mountGraph([
            mk('ob1', 'object-build', { inputCount: 1, objectKeys: ['a'] }),
            mk('ob4', 'object-build', { inputCount: 4, objectKeys: ['a', 'b', 'c', 'd'] }),
            mk('ob8', 'object-build', { inputCount: 8, objectKeys: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }),
        ]);
        const h1 = heightOf(w, 'ob1');
        const h4 = heightOf(w, 'ob4');
        const h8 = heightOf(w, 'ob8');
        ok('object-build(1 key) is a real, positive height', h1 > 0, `h1=${h1}`);
        ok('object-build(4 keys) is strictly taller than 1 key', h4 > h1, `h1=${h1} h4=${h4}`);
        ok('object-build(8 keys) is strictly taller than 4 keys', h8 > h4, `h4=${h4} h8=${h8}`);
        // Each additional key adds exactly one 32px .input-control + its own
        // 4px flex-column gap = 36px. 1->4 keys is +3 keys, 4->8 is +4 keys.
        ok('height increases by exactly 3 keys worth (108px) from 1 to 4 keys', h4 - h1 === 3 * 36, `h1=${h1} h4=${h4} delta=${h4 - h1}`);
        ok('height increases by exactly 4 keys worth (144px) from 4 to 8 keys', h8 - h4 === 4 * 36, `h4=${h4} h8=${h8} delta=${h8 - h4}`);
        // Independent DOM-derived floor for every key count.
        [['ob1', h1], ['ob4', h4], ['ob8', h8]].forEach(([id, h]) => {
            const floor = minHeightForRenderedControls(w, id);
            ok(`object-build(${id}): height clears the independently-counted-control floor`, h >= floor, `height=${h} floor=${floor}`);
        });
    }

    // --- event-element / event-id: previously hand-tuned to a single pixel
    // with ~0-1px margin (168 for a ~165-167px real need) -- now computed
    // from the exact separator structure plus an explicit safety margin. ---
    {
        const w = await mountGraph([
            mk('ee', 'event-element', { eventType: 'click' }),
            mk('ei', 'event-id', { eventType: 'click' }),
        ]);
        const hee = heightOf(w, 'ee');
        const hei = heightOf(w, 'ei');
        ok('event-element height has real margin over its previous razor-thin constant (168)', hee > 168, `height=${hee}`);
        ok('event-id height has real margin over its previous razor-thin constant (168)', hei > 168, `height=${hei}`);
        ok('event-element clears the independently-counted-control floor', hee >= minHeightForRenderedControls(w, 'ee'), `height=${hee} floor=${minHeightForRenderedControls(w, 'ee')}`);
    }

    // --- css-unit: same razor-thin-constant issue (136 for a near-136px need). ---
    {
        const w = await mountGraph([mk('cu3', 'css-unit', {})]);
        const h = heightOf(w, 'cu3');
        ok('css-unit height has real margin over its previous razor-thin constant (136)', h > 136, `height=${h}`);
        ok('css-unit clears the independently-counted-control floor', h >= minHeightForRenderedControls(w, 'cu3'), `height=${h} floor=${minHeightForRenderedControls(w, 'cu3')}`);
    }

    // --- API Request: unaffected by this pass (already had comfortable
    // margin per audit), spot-checked here since it's explicitly required. ---
    {
        const w = await mountGraph([mk('api2', 'api-request', { apiUrl: 'https://x.test', apiMethod: 'POST', apiHeaders: '{}', apiTimeout: 5000 })]);
        const h = heightOf(w, 'api2');
        ok('api-request clears the independently-counted-control floor', h >= minHeightForRenderedControls(w, 'api2'), `height=${h} floor=${minHeightForRenderedControls(w, 'api2')}`);
    }

    // --- JSON Body: canvas body is a static "Configure in sidebar"
    // placeholder (like memory-* nodes), so its own card never grows a
    // config UI to overflow -- confirms it doesn't regress to 0 or a
    // too-small height either. ---
    {
        const w = await mountGraph([mk('jb', 'json-body', { jsonBodyText: '{}' })]);
        const h = heightOf(w, 'jb');
        ok('json-body has a sane minimum height', h >= 78, `height=${h}`);
    }

    // --- Conditional/dynamic controls: `output`'s "Use ID Input" checkbox
    // only renders when NO Element pin is wired (outputElementSource is
    // null) -- the SAME computed height must be sufficient in BOTH states
    // (over-provisioned for the max case is a valid, simple, correct
    // strategy for a boolean-conditional control -- it must never be sized
    // for only the smaller state). ---
    {
        const w = await mountGraph([
            mk('out-unwired', 'output', { selectedElement: '' }),
            mk('out-wired', 'output', { outputTargetElementPin: true }),
            mk('src', 'element-ref', { elementUseManualId: true, customElementId: 'x' }),
        ], [{ id: 'wc', fromId: 'src', fromOutput: 'output0', toId: 'out-wired', toInput: 'input0' }]);
        const hUnwired = heightOf(w, 'out-unwired');
        const hWired = heightOf(w, 'out-wired');
        ok('output (conditional checkbox hidden, Element pin wired) has a sane height', hWired >= 78, `height=${hWired}`);
        ok('output (conditional checkbox shown, Element pin unwired) has a sane height', hUnwired >= 78, `height=${hUnwired}`);
        ok('output uses ONE height covering both conditional states (no under-provisioned state)', hUnwired === hWired, `unwired=${hUnwired} wired=${hWired}`);
    }

    // --- Regression: Output's real INPUT PIN COUNT (Element pin + Value,
    // ALWAYS -- not data-driven by what the user actually wires) was never
    // looked at by the height formula at all; only getOutputCount (the
    // sink's own output side, ~0-1) was measured. Both pins still render
    // one .label-row each unconditionally, so some rendered past the
    // bottom edge -- exactly the reported "half of input pins flying under
    // the node" bug. (Background/Color/Disabled/CSS were separately removed
    // -- see action_style_value_disable_smoke.js -- so the pin count that
    // originally exposed this bug is now 2, not 6, but the same height
    // formula gap applies at any pin count.) ---
    {
        const w = await mountGraph([mk('out-pins', 'output', { selectedElement: '' })]);
        const el = w.document.querySelector('[data-element-id="out-pins"]');
        const pinCount = el.querySelectorAll('.pin.input').length;
        const h = heightOf(w, 'out-pins');
        ok('output renders both input pins (Element + Value)', pinCount === 2, `pinCount=${pinCount}`);
        // Pin rows are CSS-locked exact: .label-row{min-height:34px!important},
        // 8px gap between them -- this is a precise floor, not an estimate.
        const pinRowFloor = 44 + (pinCount * 34) + ((pinCount - 1) * 8);
        ok('computed height covers all 6 real pin rows, not just the config body', h >= pinRowFloor, `height=${h} pinRowFloor=${pinRowFloor} pinCount=${pinCount}`);
    }

    // --- 2) Labels are present as persistent text, not just a placeholder ---
    {
        const w = await mountGraph([
            mk('api', 'api-request', { apiUrl: 'https://x.test', apiTimeout: 15000 }),
            mk('fld', 'api-field', { apiFieldType: 'zip' }),
            mk('ntb2', 'number-to-base', { parseRadix: 16 }),
            mk('cj', 'css-join', { inputCount: 3 }),
            mk('cu2', 'css-unit', {}),
            mk('lm', 'api-list-mapper', { apiListMatchMode: 'auto', apiListItemType: 'string' }),
            mk('ss2', 'string-split', {}),
        ]);
        const text = w.document.getElementById('host').textContent;
        ok('API node has a "Timeout (ms)" label', /Timeout \(ms\)/.test(text));
        ok('api-field has a "Field Type" label', /Field Type/.test(text));
        // Plain substring, not \bBase\b -- same flattened-textContent
        // adjacency issue as the "Value" check below.
        ok('number-to-base has a "Base" label', text.includes('Base'));
        ok('number-to-base has a "Minimum Digits" label', /Minimum Digits/.test(text));
        // Short one-line labels (the old wrapping explanation paragraph pushed
        // the property inputs out of the node; it is now the label's tooltip).
        ok('css-join has an "Inputs to join (2-8)" label', /Inputs to join \(2-8\)/.test(text));
        ok('css-join has a "CSS property per input (optional)" label', /CSS property per input \(optional\)/.test(text));
        ok('css-join no longer renders the long wrapping explanation', !/fill this in to join bare values/.test(text));
        // Not \bValue\b: React's flattened textContent has no whitespace
        // between adjacent elements, so this label sits directly against the
        // preceding pin label ("...NumberValuepx...") with no word boundary.
        ok('css-unit has a "Value" label', text.includes('Value'));
        ok('api-list-mapper has a "Match Mode" label', /Match Mode/.test(text));
        ok('api-list-mapper has an "Item Type" label', /Item Type/.test(text));
        ok('string-split has a "Delimiter" label', /Delimiter/.test(text));
        ok('string-split has a "Part Index" label', /Part Index/.test(text));
    }

    // --- 3) memory-read-boolean: no redundant free-text "Default Value" control ---
    {
        const w = await mountGraph([
            mk('mrb', 'memory-read-boolean', { variableKey: 'flag', defaultValue: false }),
            mk('mrn', 'memory-read-number', { variableKey: 'count', defaultValue: 0 }),
        ]);
        const select = (id) => {
            const el = w.document.querySelector(`[data-element-id="${id}"]`);
            el.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0 }));
            el.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0 }));
        };

        select('mrb');
        await wait(100);
        let text = w.document.getElementById('host').textContent;
        ok('memory-read-boolean shows "Boolean Value"', /Boolean Value/.test(text));
        ok('memory-read-boolean does NOT show a redundant "Default Value" text control', !/Default Value/.test(text), text.slice(0, 200));

        select('mrn');
        await wait(100);
        text = w.document.getElementById('host').textContent;
        ok('memory-read-number still shows "Default Value"', /Default Value/.test(text));
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})();
