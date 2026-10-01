/* Regression test for: "mountElementorLogicEditor() is unavailable" breaking
 * the Elementor Logic Editor outright.
 *
 * Root cause: a previous fix for "PRO doesn't work in Elementor" added
 * `calcgraph-pro-editor-config` (a PRO-owned WP script handle) as a hard
 * dependency of MAIN's `nodelogic-elementor-react` enqueue
 * (nodelogic-graph-builder.php), reasoning that it would keep load order
 * correct. On sites where that PRO handle's own registration wasn't resolved
 * by WordPress' dependency graph in time, `nodelogic-elementor-react`
 * (dist/build/elementor.js -- the script that defines
 * window.mountElementorLogicEditor) stopped being enqueued/printed entirely,
 * so the global was never defined and elementor-logic.js's own defensive
 * check ("mountElementorLogicEditor() is unavailable") fired on every click
 * of "Open Logic Editor". The dependency was unnecessary in the first place:
 * GraphEditor reads window.calcgraphProEditorConfig lazily in a useEffect and
 * also listens for the 'nodelogic-graph-builder-config-updated' event PRO's
 * config script dispatches, so script print ORDER between the two plugins'
 * independent enqueue calls never mattered functionally.
 *
 * Covered two ways:
 *   1) A static check that MAIN no longer declares a WP script dependency on
 *      any PRO-owned handle for the Elementor bundle enqueue (locks against
 *      reintroducing this exact regression).
 *   2) A live jsdom check of the real built bundle: window.mountElementorLogicEditor
 *      is defined and actually mounts the graph editor, in BOTH possible
 *      script-execution orders relative to PRO's config script (order must
 *      not matter, since MAIN no longer declares a dependency forcing one).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0, skip = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const skipMsg = (l, why) => { skip++; console.log(`SKIP  ${l}  (${why})`); };

const ROOT = path.resolve(__dirname, '..');
const PRO_ROOT = path.resolve(ROOT, '..', 'nodelogic-graph-builder-pro');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');

// --- 1) Static check: MAIN's Elementor bundle enqueue has no PRO-owned dep ---
(() => {
    const src = fs.readFileSync(path.join(ROOT, 'nodelogic-graph-builder.php'), 'utf8');
    const enqueueMatch = src.match(/wp_enqueue_script\(\s*['"]nodelogic-elementor-react['"][\s\S]{0,400}?\);/);
    ok('nodelogic-elementor-react enqueue call found', !!enqueueMatch);
    ok(
        'nodelogic-elementor-react does NOT depend on a PRO-owned script handle',
        !!enqueueMatch && !/calcgraph-pro/.test(enqueueMatch[0]),
        enqueueMatch ? enqueueMatch[0] : 'enqueue call not found'
    );
})();

// --- 2) Live check: the mount function is defined regardless of load order ---
async function checkMountAvailable(label, { proConfigFirst }) {
    const dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { runScripts: 'dangerously', url: 'https://editor.test/', pretendToBeVisual: true });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    if (!w.ResizeObserver) w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.scrollTo = () => {};

    const proEditorConfigJsPath = path.join(PRO_ROOT, 'includes', 'js', 'pro-editor-config.js');
    const hasPro = fs.existsSync(proEditorConfigJsPath);
    const loadProConfig = () => {
        w.calcgraphProEditorConfig = { hasAccess: true, enableCustomNodes: false, enableTemplates: false, plan: 'pro', customNodes: [] };
        const s = w.document.createElement('script');
        s.textContent = fs.readFileSync(proEditorConfigJsPath, 'utf8');
        w.document.body.appendChild(s);
    };
    const loadBundle = () => {
        const s = w.document.createElement('script'); s.textContent = BUNDLE; w.document.body.appendChild(s);
    };

    if (hasPro && proConfigFirst) loadProConfig();
    loadBundle();
    if (hasPro && !proConfigFirst) loadProConfig();

    ok(`${label}: window.mountElementorLogicEditor is a function`, typeof w.mountElementorLogicEditor === 'function');

    if (typeof w.mountElementorLogicEditor === 'function') {
        w.mountElementorLogicEditor(w.document.getElementById('host'), {
            editorId: 'e', graphState: { elements: [], connections: [], formula: '', updatedAt: 0 },
            onStateChange: () => {}, onFormulaChange: () => {},
        });
        await new Promise((r) => setTimeout(r, 450));
        const mounted = !!Array.from(w.document.querySelectorAll('button')).find((b) => /save graph/i.test(b.textContent || ''));
        ok(`${label}: mount actually renders the graph editor (Save Graph button present)`, mounted);
    } else {
        fail++;
        console.log(`FAIL  ${label}: mount actually renders the graph editor (Save Graph button present)  (mount function missing)`);
    }

    if (!hasPro && proConfigFirst === true) {
        // only emit once, from the first call
        skipMsg('PRO config script variant', `sibling PRO repo not found at ${PRO_ROOT} -- checked without PRO present instead`);
    }
}

(async () => {
    await checkMountAvailable('bundle loads before PRO config script', { proConfigFirst: false });
    await checkMountAvailable('bundle loads after PRO config script', { proConfigFirst: true });

    console.log(`\n${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
    process.exit(fail === 0 ? 0 : 1);
})();
