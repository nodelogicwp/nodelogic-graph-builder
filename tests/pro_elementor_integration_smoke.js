/* Regression test for the "PRO doesn't work in Elementor" integration bug.
 *
 * Root cause: PRO (nodelogic-graph-builder-pro/includes/pro-features.php)
 * only ever localized `window.calcgraphProEditorConfig` on WordPress's
 * `enqueue_block_editor_assets` hook, which fires for the Gutenberg block
 * editor only -- it never fires on the Elementor edit screen. MAIN's shared
 * GraphEditor component (src/components/graphEditor.tsx) reads that same
 * global to merge PRO nodes/capabilities into the node catalog in BOTH
 * editor contexts, so on Elementor the global was always empty/undefined and
 * PRO silently contributed zero nodes there, regardless of license state.
 *
 * This is a PHP hook-wiring bug with no PHP test runner in this project (see
 * tests/README.md), so it's covered two ways:
 *   1) A static check that PRO's pro-features.php enqueues/localizes the PRO
 *      editor config from BOTH the Gutenberg hook and an Elementor editor
 *      hook (skipped, not failed, if the sibling PRO repo isn't checked out
 *      next to this one -- e.g. in a MAIN-only CI run).
 *   2) A live jsdom check of the actual consumer contract: once
 *      `window.calcgraphProEditorConfig` + PRO's `pro-editor-config.js` are
 *      present in the page -- exactly what happens after the PHP fix ships
 *      that global into the Elementor editor too -- the shared GraphEditor
 *      component (real built bundle) merges PRO's node catalog (e.g. the
 *      "API Status" / "Memory" nodes) into its sidebar tree, regardless of
 *      which editor mounted it. This locks the JS-side half of the contract
 *      PRO depends on.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0, skip = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const skipMsg = (l, why) => { skip++; console.log(`SKIP  ${l}  (${why})`); };

const ROOT = path.resolve(__dirname, '..');
const PRO_ROOT = path.resolve(ROOT, '..', 'nodelogic-graph-builder-pro');

// --- 1) Static check: PRO PHP wires the config to Gutenberg AND Elementor ---
(() => {
    const proFeaturesPath = path.join(PRO_ROOT, 'includes', 'pro-features.php');
    if (!fs.existsSync(proFeaturesPath)) {
        skipMsg('PRO pro-features.php hooks both editors', `sibling PRO repo not found at ${PRO_ROOT}`);
        return;
    }
    const src = fs.readFileSync(proFeaturesPath, 'utf8');
    ok('PRO still hooks Gutenberg\'s enqueue_block_editor_assets', /enqueue_block_editor_assets/.test(src));
    ok('PRO also hooks an Elementor editor enqueue action', /elementor\/editor\/(before_enqueue_scripts|init)/.test(src));
    ok('PRO localizes calcgraphProEditorConfig at least once', /wp_localize_script\(\s*['"]calcgraph-pro-editor-config['"],\s*['"]calcgraphProEditorConfig['"]/.test(src));
    // The Elementor hook callback (or a shared helper it calls) must reach
    // the same localize call as Gutenberg's -- verified indirectly by making
    // sure the enqueue+localize block isn't only reachable from inside the
    // enqueue_block_editor_assets closure.
    const elementorHookMatch = src.match(/add_action\(\s*['"]elementor\/editor\/before_enqueue_scripts['"][\s\S]{0,400}/);
    ok(
        'the Elementor hook callback actually enqueues the PRO editor config script',
        !!elementorHookMatch && /calcgraph-pro-editor-config|calcgraph_pro_enqueue_editor_config/.test(elementorHookMatch[0]),
        elementorHookMatch ? elementorHookMatch[0].slice(0, 200) : 'no elementor/editor/before_enqueue_scripts hook found'
    );
})();

// --- 2) Live check: the JS merge contract works once the global is present ---
(async () => {
    const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
    const proEditorConfigJsPath = path.join(PRO_ROOT, 'includes', 'js', 'pro-editor-config.js');
    if (!fs.existsSync(proEditorConfigJsPath)) {
        skipMsg('PRO node catalog merges into the Elementor-mounted GraphEditor', `sibling PRO repo not found at ${PRO_ROOT}`);
        finish();
        return;
    }
    const PRO_EDITOR_CONFIG_JS = fs.readFileSync(proEditorConfigJsPath, 'utf8');

    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.scrollTo = () => {};

    // Simulate exactly what the fixed PHP now ships to the Elementor editor
    // page: the localized PRO state global, ...
    w.calcgraphProEditorConfig = {
        hasAccess: true,
        enableCustomNodes: false,
        enableTemplates: false,
        plan: 'pro',
        customNodes: [],
    };
    // ... followed by pro-editor-config.js, which reads that global and
    // builds window.nodelogicGraphBuilderConfig.treeData (this is the exact
    // same file/handle Gutenberg has always loaded successfully).
    const s1 = w.document.createElement('script'); s1.textContent = PRO_EDITOR_CONFIG_JS; w.document.body.appendChild(s1);

    // Then the Elementor bundle mounts, exactly like on the real editor page.
    const s2 = w.document.createElement('script'); s2.textContent = BUNDLE; w.document.body.appendChild(s2);

    w.mountElementorLogicEditor(w.document.getElementById('host'), {
        editorId: 'e', graphState: { elements: [], connections: [], formula: '', updatedAt: 0 },
        onStateChange: () => {}, onFormulaChange: () => {},
    });
    await new Promise((r) => setTimeout(r, 450));

    // Top-level folder names are always rendered in the sidebar tree (only
    // their children are gated behind expand/collapse state), so checking
    // for PRO's addon folder headers is a reliable signal that its tree data
    // actually merged into the catalog this GraphEditor instance is using --
    // without depending on the tree's expand/collapse interaction.
    const text = w.document.getElementById('host').textContent;
    ok('Elementor-mounted GraphEditor sidebar lists PRO\'s "API Nodes" folder', /API Nodes/.test(text));
    ok('Elementor-mounted GraphEditor sidebar lists PRO\'s "Memory Logic" folder', /Memory Logic/.test(text));

    finish();
})();

function finish() {
    setTimeout(() => {
        console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
        process.exit(fail === 0 ? 0 : 1);
    }, 50);
}
