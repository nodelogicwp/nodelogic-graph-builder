/* MAIN / WORK / RECOVERY / HISTORY / UNDO through the REAL editor bundle
 * (dist/build/elementor.js) in jsdom: every user edit reaches the working
 * copy (and only it), reopening restores it, Save Graph publishes MAIN +
 * history atomically, recovery is offered only for real content differences,
 * import/export/restore are confirmed + undoable, and undo groups user
 * operations. Run `npm run build:elementor` first if src/ changed. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
// NL_EDITOR_BUNDLE: run against another build (used for mutation testing).
const BUNDLE = fs.readFileSync(process.env.NL_EDITOR_BUNDLE || path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const S = require(path.join(__dirname, 'graphStore.cjs'));

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
    (cond ? pass++ : fail++);
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : `  (${detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)})`}`);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
setTimeout(() => { console.log('HARD EXIT'); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1); }, 240000);

const MAIN_A = () => ({
    elements: [
        { id: 'n1', name: 'Number', type: 'number', x: 100, y: 100, data: { value: 3 } },
        { id: 'n2', name: 'Number', type: 'number', x: 100, y: 300, data: { value: 4 } },
        { id: 'ref', name: 'Element Reference', type: 'element-ref', x: 100, y: 500, data: { elementUseManualId: true, customElementId: 'sink' } },
        { id: 'out', name: 'Output', type: 'output', x: 500, y: 200, data: { outputTargetElementPin: true } },
    ],
    connections: [
        { id: 'c1', fromId: 'ref', fromOutput: 'output0', toId: 'out', toInput: 'input0' },
        { id: 'c2', fromId: 'n1', fromOutput: 'output0', toId: 'out', toInput: 'input1' },
    ],
    formula: '',
    updatedAt: 1000,
});

function makeWindow(storageFrom) {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously', url: 'https://editor.test/wp-admin/post.php', pretendToBeVisual: true });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.scrollTo = () => {};
    w.__errors = [];
    const origError = w.console.error;
    w.console.error = (...args) => { w.__errors.push(args.map(String).join(' ')); };
    w.console.info = () => {};
    w.console.debug = () => {};
    if (storageFrom) {
        for (let i = 0; i < storageFrom.localStorage.length; i++) {
            const key = storageFrom.localStorage.key(i);
            w.localStorage.setItem(key, storageFrom.localStorage.getItem(key));
        }
    }
    w.__exports = [];
    w.URL.createObjectURL = (blob) => { w.__lastBlob = blob; return 'blob:test'; };
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function click() { w.__exports.push({ name: this.download, blob: w.__lastBlob }); };
    const script = w.document.createElement('script');
    script.textContent = BUNDLE;
    w.document.body.appendChild(script);
    void origError;
    return w;
}

function mount(w, options = {}) {
    const host = w.document.createElement('div');
    w.document.body.appendChild(host);
    const env = { w, host, published: [], limits: [], dirty: [] };
    env.root = w.mountElementorLogicEditor(host, {
        editorId: options.editorId || 'ed-1',
        graphState: options.graphState === undefined ? MAIN_A() : options.graphState,
        graphHistory: options.graphHistory || [],
        historyLimit: options.historyLimit === undefined ? 5 : options.historyLimit,
        onPublish: (payload) => {
            if (options.rejectPublish) return false;
            env.published.push(JSON.parse(JSON.stringify(payload)));
            return true;
        },
        onHistoryLimitChange: (limit) => env.limits.push(limit),
        onUnsavedChange: (dirty) => env.dirty.push(dirty),
    });
    env.unmount = () => env.root.unmount();
    env.q = (sel) => host.querySelector(sel);
    env.qa = (sel) => Array.from(host.querySelectorAll(sel));
    env.card = (id) => host.querySelector(`[data-element-id="${id}"]`);
    env.input = (id) => env.card(id) && env.card(id).querySelector('input.input-control');
    env.status = () => (env.q('.nl-work-status') ? env.q('.nl-work-status').textContent : '');
    env.statusState = () => (env.q('.nl-work-status') ? env.q('.nl-work-status').getAttribute('data-state') : '');
    env.button = (re) => Array.from(w.document.querySelectorAll('button')).find((b) => re.test((b.textContent || '').trim()));
    env.dialog = () => w.document.querySelector('[role="dialog"]');
    env.dialogText = () => (env.dialog() ? env.dialog().textContent : '');
    env.work = () => {
        const raw = w.localStorage.getItem(`nodelogic.graph.v2.${options.editorId || 'ed-1'}.work`);
        return raw ? JSON.parse(raw) : null;
    };
    env.storageKeys = () => Object.keys({ ...w.localStorage });
    env.backups = () => JSON.parse(w.localStorage.getItem(`nodelogic.graph.v2.${options.editorId || 'ed-1'}.backups`) || '[]');
    env.log = () => (w.__nodelogicPersistenceLog || []).filter((entry) => entry.editorId === (options.editorId || 'ed-1'));
    return env;
}

const setValue = (w, input, value) => {
    const proto = input.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, String(value));
    input.dispatchEvent(new w.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};
const key = (w, init) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { bubbles: true, ...init }));
const undo = (w) => key(w, { key: 'z', ctrlKey: true });
const redo = (w) => key(w, { key: 'y', ctrlKey: true });
const moveNode = async (env, id, dx, dy) => {
    const { w } = env;
    env.card(id).dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200, clientY: 200 }));
    await wait(20);
    env.q('.canvas').dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 200 + dx, clientY: 200 + dy }));
    await wait(20);
};
const deleteNode = async (env, id) => {
    const { w } = env;
    env.card(id).dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    env.q('.canvas').dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    await wait(20);
    key(w, { key: 'Delete' });
    await wait(20);
};
const workNode = (env, id) => (env.work() ? env.work().graph.elements.find((e) => e.id === id) : undefined);
// The Number node stores what the user typed in data.valueText.
const typed = (node) => (node && node.data ? String(node.data.valueText ?? node.data.value) : undefined);
const recoveryRecord = (editorId, graph, over = {}) => S.buildStoredRecord({
    kind: 'nodelogic-recovery', editorId, snapshotId: over.snapshotId || 'snap-1', sessionId: over.sessionId || 'crashed-session',
    revision: 1, afterWorkRevision: over.afterWorkRevision ?? -1, createdAt: over.createdAt ?? Date.now() - 60000,
    baseMainHash: '', reason: 'pagehide', appVersion: 'test', graph,
});

(async () => {
    // ── A/B/C: edits reach WORK only; reopening restores them; MAIN untouched ──
    {
        const w = makeWindow();
        let env = mount(w);
        await wait(300);
        ok('A fresh open: no dialog, status says identical to the page', !env.dialog() && env.statusState() === 'clean', env.status());
        ok('A untouched graph writes no working copy', env.work() === null);

        setValue(w, env.input('n1'), '42');
        await wait(30);
        ok('B config edit marks unpublished changes immediately', env.statusState() === 'dirty' && env.dirty.includes(true), env.status());
        await wait(600);
        ok('B config edit reaches the stored working copy (was never autosaved before)', typed(workNode(env, 'n1')) === '42', workNode(env, 'n1'));
        ok('B MAIN untouched by editing (no publish)', env.published.length === 0);
        ok('B working copy is based on the current MAIN', env.work().baseMainHash === S.semanticHash(S.pickGraphContent(MAIN_A())), env.work().baseMainHash);

        setValue(w, env.input('n2'), '7');
        env.unmount(); // closing the editor within the typing window flushes
        ok('C closing the editor flushes the latest edit', typed(workNode(env, 'n2')) === '7', workNode(env, 'n2'));
        ok('C no recovery snapshot left after a clean close', !env.storageKeys().some((k) => k.includes('.recovery.')), env.storageKeys());

        env = mount(w);
        await wait(300);
        ok('C reopening restores the working copy without any prompt', !env.dialog() && env.input('n1').value === '42' && env.input('n2').value === '7', `${env.input('n1').value}/${env.input('n2').value} dialog=${env.dialogText().slice(0, 80)}`);
        ok('C reopened state shows unpublished changes', env.statusState() === 'dirty', env.status());

        // ── D: publish ───────────────────────────────────────────────────────
        env.button(/^Save Graph$/).click();
        await wait(100);
        const pub = env.published[0];
        ok('D Save Graph publishes exactly once', env.published.length === 1);
        ok('D published MAIN carries format 2, revision 1 and a compiled formula', pub && pub.state.formatVersion === 2 && pub.state.revision === 1 && typeof pub.state.formula === 'string' && pub.state.formula.length > 0, pub && pub.state);
        ok('D previous MAIN is kept as history version', pub && pub.history.length === 1 && S.semanticEqual(pub.history[0].graph, S.pickGraphContent(MAIN_A())), pub && pub.history);
        ok('D after publish: status clean', env.statusState() === 'clean', env.status());
        ok('D working copy re-based on the new MAIN', env.work().baseMainHash === S.semanticHash(S.pickGraphContent(pub.state)));
        ok('D replaced MAIN also saved as a local backup', env.backups().some((b) => b.reason === 'before-publish'));
        env.unmount();

        // ── E: reopen with the saved page (MAIN = published) ─────────────────
        env = mount(w, { graphState: pub.state, graphHistory: pub.history });
        await wait(300);
        ok('E reopening after the page was saved: clean, no prompt', !env.dialog() && env.statusState() === 'clean', env.status() + env.dialogText());
        env.unmount();

        // ── F: reopen when the page was NOT updated after Save Graph ─────────
        env = mount(w, { graphState: MAIN_A() });
        await wait(300);
        ok('F page not updated after Save Graph: the user is asked (no silent winner)', /differs from the graph saved on the page/.test(env.dialogText()) && /not updated afterwards/.test(env.dialogText()), env.dialogText().slice(0, 200));
        ok('F nothing replaced before the choice (canvas shows the page graph)', env.input('n1').value === '3');
        env.button(/Continue with my working copy/).click();
        await wait(100);
        ok('F "continue" loads the working copy', env.input('n1').value === '42' && env.statusState() === 'dirty');
        env.unmount();
        env = mount(w, { graphState: MAIN_A() });
        await wait(300);
        ok('F after choosing, the next open is quiet (WORK rebased on that MAIN)', !env.dialog() && env.input('n1').value === '42', env.dialogText().slice(0, 80));
        env.unmount();
    }

    // ── G: "use the page version" keeps the working copy as a backup ────────
    {
        const w = makeWindow();
        let env = mount(w);
        await wait(200);
        setValue(w, env.input('n1'), '55');
        env.unmount();
        const changedMain = MAIN_A();
        changedMain.elements[1].data.value = 99; // edited elsewhere
        env = mount(w, { graphState: changedMain });
        await wait(300);
        ok('G MAIN changed under the working copy: user is asked', /changed after you started this working copy/.test(env.dialogText()), env.dialogText().slice(0, 160));
        env.button(/Use the page version/).click();
        await wait(100);
        ok('G "use page version": page graph shown, working copy removed', env.input('n2').value === '99' && env.work() === null);
        ok('G the abandoned working copy is kept as a local backup', env.backups().some((b) => b.reason === 'conflict-replaced' && typed(b.graph.elements.find((e) => e.id === 'n1')) === '55'));
        env.unmount();
    }

    // ── H/I/J/K: recovery ───────────────────────────────────────────────────
    {
        // I: false positive regression -- snapshot identical in content, newer timestamp, other order/ids
        const w = makeWindow();
        const same = S.pickGraphContent(MAIN_A());
        same.elements.reverse();
        same.connections = same.connections.map((c, i) => ({ ...c, id: `regen-${i}`, valueType: 'number' }));
        w.localStorage.setItem('nodelogic.graph.v2.ed-1.recovery.crashed-session', JSON.stringify(recoveryRecord('ed-1', same, { createdAt: Date.now() + 100000 })));
        let env = mount(w);
        await wait(300);
        ok('I recovery identical to the saved graph (only order/ids/timestamp differ): NO prompt', !env.dialog(), env.dialogText().slice(0, 100));
        ok('I the redundant snapshot is cleaned up (copied to backups first)', !env.storageKeys().some((k) => k.includes('.recovery.')) && env.backups().length >= 1, env.storageKeys());
        ok('I decision is logged with its reason', env.log().some((e) => e.event === 'recovery-compared' && /^equal-to-(main|work)$/.test(e.details.decision) && /identical/.test(e.details.reason)));
        env.unmount();

        // H: real lost changes -> prompt with diff; restore goes to WORK only
        const lost = S.pickGraphContent(MAIN_A());
        lost.elements.push({ id: 'n9', name: 'Number', type: 'number', x: 300, y: 600, data: { value: 9 } });
        lost.elements[0].x = 333;
        w.localStorage.setItem('nodelogic.graph.v2.ed-1.recovery.crashed-session', JSON.stringify(recoveryRecord('ed-1', lost, { snapshotId: 'lost-1' })));
        env = mount(w);
        await wait(300);
        const text = env.dialogText();
        ok('H real difference: recovery prompt shown', /Unsaved changes found/.test(text), text.slice(0, 100));
        ok('H prompt explains what differs (+1 node, moved 1 node)', /\+1 node/.test(text) && /moved 1 node/.test(text), text.slice(0, 400));
        ok('H prompt explains why it was shown', /Why this is shown/.test(text));
        ok('H detection is logged (why recovery exists)', env.log().some((e) => e.event === 'recovery-detected' && e.details.snapshotId === 'lost-1'));
        ok('H nothing replaced before the user decides', !env.card('n9'));
        env.button(/Restore these changes/).click();
        await wait(200);
        ok('H restore loads the snapshot into the working copy', Boolean(env.card('n9')) && workNode(env, 'n9'));
        ok('H restore never publishes (MAIN untouched)', env.published.length === 0);
        ok('H restored snapshot removed only after WORK holds it', !env.storageKeys().some((k) => k.includes('.recovery.crashed-session')));
        undo(w);
        await wait(100);
        ok('H undo after restore brings the previous working copy back', !env.card('n9'));
        env.unmount();

        // J: dismiss is remembered for that snapshot only
        const w2 = makeWindow();
        w2.localStorage.setItem('nodelogic.graph.v2.ed-1.recovery.crashed-session', JSON.stringify(recoveryRecord('ed-1', lost, { snapshotId: 'lost-2' })));
        env = mount(w2);
        await wait(300);
        env.button(/^Dismiss$/).click();
        await wait(100);
        ok('J dismiss closes the prompt and keeps the snapshot as a backup', !env.dialog() && env.backups().some((b) => b.reason === 'dismissed-recovery'));
        env.unmount();
        env = mount(w2);
        await wait(300);
        ok('J a dismissed snapshot is not offered again after reopening', !env.dialog(), env.dialogText().slice(0, 80));
        env.unmount();

        // "Decide later" is not a decision: nothing removed, asked again next time
        const wLater = makeWindow();
        wLater.localStorage.setItem('nodelogic.graph.v2.ed-1.recovery.crashed-session', JSON.stringify(recoveryRecord('ed-1', lost, { snapshotId: 'later-1' })));
        env = mount(wLater);
        await wait(300);
        env.button(/^Decide later$/).click();
        await wait(100);
        ok('J "Decide later" closes the prompt and leaves the snapshot untouched', !env.dialog() && env.storageKeys().includes('nodelogic.graph.v2.ed-1.recovery.crashed-session') && !env.card('n9'));
        env.unmount();
        env = mount(wLater);
        await wait(300);
        ok('J ...and the same snapshot is offered again on the next open', /Unsaved changes found/.test(env.dialogText()));
        env.unmount();

        // K: corrupted / foreign snapshots never prompt, never break, are not deleted
        const w3 = makeWindow();
        const good = JSON.stringify(recoveryRecord('ed-1', lost, { snapshotId: 'lost-3' }));
        w3.localStorage.setItem('nodelogic.graph.v2.ed-1.recovery.torn', good.slice(0, good.length - 40));
        w3.localStorage.setItem('nodelogic.graph.v2.ed-1.recovery.foreign', JSON.stringify(recoveryRecord('OTHER', lost)));
        env = mount(w3);
        await wait(300);
        ok('K corrupted + foreign snapshots: no prompt, editor works', !env.dialog() && env.input('n1').value === '3' && w3.__errors.length === 0, w3.__errors.join(' | '));
        ok('K corrupted snapshot is kept for diagnosis (not deleted)', env.storageKeys().includes('nodelogic.graph.v2.ed-1.recovery.torn'));
        env.unmount();
    }

    // ── L: legacy (pre-v2) drafts ───────────────────────────────────────────
    {
        const w = makeWindow();
        const legacySame = { ...MAIN_A(), formula: 'old compiled formula', updatedAt: Date.now() + 99999 };
        legacySame.elements = legacySame.elements.map((e) => ({ ...e, valueType: 'number' }));
        w.localStorage.setItem('formulaEditor.autosave.ed-1', JSON.stringify(legacySame));
        w.localStorage.setItem('formulaEditor.save.ed-1', JSON.stringify(legacySame));
        let env = mount(w);
        await wait(300);
        ok('L legacy autosave equal in content (old false positive): NO prompt', !env.dialog(), env.dialogText().slice(0, 80));
        ok('L both redundant legacy keys migrated away', !env.storageKeys().some((k) => k.startsWith('formulaEditor.')), env.storageKeys());
        env.unmount();

        const w2 = makeWindow();
        const legacyDifferent = MAIN_A();
        legacyDifferent.elements[0].data.value = 1234;
        w2.localStorage.setItem('formulaEditor.autosave.ed-1', JSON.stringify(legacyDifferent));
        env = mount(w2);
        await wait(300);
        ok('L legacy draft with real changes is offered (previous editor version wording)', /previous version of the editor/.test(env.dialogText()), env.dialogText().slice(0, 160));
        env.button(/Restore these changes/).click();
        await wait(100);
        ok('L restoring the legacy draft migrates it into the working copy', env.input('n1').value === '1234' && workNode(env, 'n1').data.value === 1234 && !env.storageKeys().some((k) => k.startsWith('formulaEditor.')));
        env.unmount();
    }

    // ── M: undo / redo ──────────────────────────────────────────────────────
    {
        const w = makeWindow();
        const env = mount(w);
        await wait(200);
        const input = env.input('n1');
        setValue(w, input, '31'); await wait(5);
        setValue(w, input, '314'); await wait(5);
        setValue(w, input, '3141');
        await wait(50);
        undo(w);
        await wait(50);
        ok('M typing in one field is ONE undo step', env.input('n1').value === '3', env.input('n1').value);
        redo(w);
        await wait(50);
        ok('M redo re-applies it', env.input('n1').value === '3141', env.input('n1').value);

        await moveNode(env, 'n2', 80, 40);
        const movedLeft = env.card('n2').style.left;
        undo(w);
        await wait(50);
        ok('M move is undoable', env.card('n2').style.left !== movedLeft, `${movedLeft} -> ${env.card('n2').style.left}`);
        redo(w);
        await wait(50);
        ok('M move redo', env.card('n2').style.left === movedLeft);

        await deleteNode(env, 'n1');
        ok('M delete removes the node and its wire', !env.card('n1'));
        undo(w);
        await wait(50);
        await wait(30);
        ok('M one undo restores the node AND its wire (delete is one step)', Boolean(env.card('n1')) && env.work().graph.connections.some((c) => c.fromId === 'n1' && c.toId === 'out'), env.work().graph.connections);
        setValue(w, env.input('n2'), '8');
        await wait(30);
        redo(w);
        await wait(50);
        ok('M a new change after undo clears redo', Boolean(env.card('n1')), 'redo re-deleted n1');
        await wait(600);
        ok('M undo/redo results are persisted to the working copy', typed(workNode(env, 'n2')) === '8', workNode(env, 'n2'));
        env.unmount();
    }

    // ── N/O: import / export ────────────────────────────────────────────────
    {
        const w = makeWindow();
        const env = mount(w);
        await wait(200);
        setValue(w, env.input('n1'), '5');
        await wait(600);
        const before = JSON.stringify(env.work().graph);
        const fileInput = env.q('input[type="file"]');
        const pick = async (name, text) => {
            Object.defineProperty(fileInput, 'files', { configurable: true, value: [new w.File([text], name, { type: 'application/json' })] });
            fileInput.dispatchEvent(new w.Event('change', { bubbles: true }));
            await wait(500);
        };
        await pick('broken.json', '{"format":"nodelogic-graph","formatVersion":1,"graph":{"elements":[{"id":"x"},{"id":"x"}]');
        ok('N malformed import: error dialog, nothing changed', /Import failed - nothing was changed/.test(env.dialogText()) && JSON.stringify(env.work().graph) === before && env.input('n1').value === '5', env.dialogText().slice(0, 160));
        env.button(/^Close$/).click();
        await wait(30);
        await pick('dupes.json', JSON.stringify({ format: 'nodelogic-graph', formatVersion: 1, graph: { elements: [{ id: 'a', type: 'number', x: 0, y: 0 }, { id: 'a', type: 'number', x: 0, y: 0 }], connections: [] } }));
        ok('N invalid graph (duplicate ids) rejected, current graph intact', /Duplicate node ids/.test(env.dialogText()) && env.input('n1').value === '5');
        env.button(/^Close$/).click();
        await wait(30);
        await pick('newer.json', JSON.stringify({ format: 'nodelogic-graph', formatVersion: 99, graph: { elements: [], connections: [] } }));
        ok('N file from a newer format version rejected', /newer version/.test(env.dialogText()));
        env.button(/^Close$/).click();
        await wait(30);

        // export the working copy, mutate, re-import the exported file
        env.button(/Versions, import & export/).click();
        await wait(30);
        env.button(/Export working copy/).click();
        await wait(30);
        const exported = w.__exports[w.__exports.length - 1];
        const exportedText = exported ? await new Promise((resolve) => { const reader = new w.FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(exported.blob); }) : ''; // jsdom Blob has no .text()
        const doc = exportedText ? JSON.parse(exportedText) : {};
        ok('O export produces a versioned file of the working copy', doc.format === 'nodelogic-graph' && doc.formatVersion === 1 && doc.source && doc.source.kind === 'work' && /\.json$/.test(exported.name), exported && exported.name);
        ok('O export contains no formula / session / recovery metadata', !/sessionId|snapshotId|"formula"/.test(exportedText));
        setValue(w, env.input('n1'), '6');
        await wait(600);
        await pick('roundtrip.json', exportedText);
        ok('N valid import asks for confirmation first (nothing applied yet)', /Import graph from file\?/.test(env.dialogText()) && env.input('n1').value === '6');
        ok('N confirmation explains the unpublished changes being replaced', /unpublished changes/.test(env.dialogText()));
        env.button(/Import into working copy/).click();
        await wait(150);
        ok('N confirmed import replaces the working copy only', env.input('n1').value === '5' && env.published.length === 0 && typed(workNode(env, 'n1')) === '5');
        ok('N the replaced working copy was backed up', env.backups().some((b) => b.reason === 'before-import'));
        undo(w);
        await wait(50);
        ok('N import is undoable', env.input('n1').value === '6');
        env.unmount();
    }

    // ── P/Q/R/S: publish failure, history limit, discard, empty formula ─────
    {
        const w = makeWindow();
        let env = mount(w, { rejectPublish: true });
        await wait(200);
        setValue(w, env.input('n1'), '77');
        await wait(30);
        env.button(/^Save Graph$/).click();
        await wait(100);
        ok('Q host rejects the publish: error shown, MAIN/history unchanged, still dirty', /Save Graph failed/.test(env.dialogText()) && env.published.length === 0 && env.statusState() === 'dirty');
        env.button(/^Close$/).click();
        env.unmount();

        env = mount(w, { historyLimit: 0 });
        await wait(300);
        env.button(/Versions, import & export/).click();
        await wait(30);
        const limitSelect = env.qa('select').find((s) => Array.from(s.options).some((o) => o.value === '10'));
        setValue(w, limitSelect, '0');
        await wait(30);
        ok('R retention change is reported to the host (applies at next save)', env.limits[env.limits.length - 1] === 0);
        env.button(/^Save Graph$/).click();
        await wait(100);
        const pubZero = env.published[0];
        ok('R limit 0: no previous versions stored in the page', pubZero && pubZero.history.length === 0 && pubZero.historyLimit === 0, pubZero && pubZero.history);
        ok('R limit 0: the replaced version still survives as a local backup', env.backups().some((b) => b.reason === 'before-publish'));
        env.unmount();

        env = mount(w, { graphState: pubZero.state });
        await wait(300);
        setValue(w, env.input('n2'), '12');
        await wait(30);
        env.button(/Discard changes/).click();
        await wait(50);
        ok('S discard asks for confirmation', /Discard unpublished changes\?/.test(env.dialogText()) && env.input('n2').value === '12');
        env.qa('button').length; // keep focus semantics simple
        Array.from(w.document.querySelectorAll('[role="dialog"] button')).find((b) => /^Discard changes$/.test(b.textContent.trim())).click();
        await wait(100);
        ok('S discard returns to the page graph, clean', env.input('n2').value === '4' && env.statusState() === 'clean', env.status());
        undo(w);
        await wait(50);
        ok('S discard is undoable', env.input('n2').value === '12');

        // empty formula: delete the Output -> publish must not keep the old formula
        await deleteNode(env, 'out');
        env.button(/^Save Graph$/).click();
        await wait(100);
        const lastPub = env.published[env.published.length - 1];
        ok('P removing all outputs publishes an EMPTY formula (old logic no longer runs)', lastPub && lastPub.state.formula === '', lastPub && lastPub.state.formula);
        env.unmount();
    }

    // ── T: another tab wrote the working copy -> never overwritten silently ──
    {
        const w = makeWindow();
        const env = mount(w);
        await wait(200);
        setValue(w, env.input('n1'), '21');
        await wait(600);
        const foreign = S.buildStoredRecord({ kind: 'nodelogic-work', editorId: 'ed-1', snapshotId: 'x', sessionId: 'OTHER-TAB', revision: env.work().revision + 5, afterWorkRevision: -1, createdAt: Date.now(), baseMainHash: env.work().baseMainHash, reason: 'autosave', appVersion: 't', graph: { ...env.work().graph, elements: env.work().graph.elements.map((e) => (e.id === 'n2' ? { ...e, data: { value: 404 } } : e)) } });
        w.localStorage.setItem('nodelogic.graph.v2.ed-1.work', JSON.stringify(foreign));
        setValue(w, env.input('n1'), '22');
        await wait(600);
        ok('T other tab’s working copy is not overwritten', env.work().sessionId === 'OTHER-TAB');
        ok('T user is told and this tab’s state is kept as a recovery snapshot', env.statusState() === 'conflict' && env.storageKeys().some((k) => k.includes('.recovery.')), env.status());
        env.button(/Keep this tab/).click();
        await wait(100);
        ok('T explicit take-over: this tab’s copy stored, other tab’s copy backed up', env.work().sessionId !== 'OTHER-TAB' && typed(workNode(env, 'n1')) === '22' && env.backups().some((b) => b.reason === 'other-tab-replaced'));
        env.unmount();
    }

    // ── U: crash (no cleanup) -> reopening in a new window ──────────────────
    {
        const w = makeWindow();
        const env = mount(w);
        await wait(200);
        await moveNode(env, 'n1', 120, 0);
        await wait(30); // structural edits are stored on the next tick
        const crashed = makeWindow(w); // copy storage WITHOUT unmount / pagehide
        const env2 = mount(crashed);
        await wait(300);
        ok('U a move right before a crash survives (stored on the next tick)', !env2.dialog() && env2.statusState() === 'dirty' && workNode(env2, 'n1').x === 220, `${workNode(env2, 'n1') && workNode(env2, 'n1').x} ${env2.dialogText().slice(0, 60)}`);
        env2.unmount();
        env.unmount();
    }

    // ── V: automatic bookkeeping never fakes changes ────────────────────────
    {
        const w = makeWindow();
        const env = mount(w);
        await wait(800);
        ok('V opening and idling: no dirty flag, no stored copy, no publish', env.statusState() === 'clean' && env.work() === null && env.published.length === 0 && !env.dirty.includes(true));
        env.unmount();
        ok('V closing an untouched editor leaves no storage behind', !Object.keys({ ...w.localStorage }).some((k) => k.startsWith('nodelogic.graph.v2.')));

        // A load that triggers real automatic bookkeeping (a wire on a pin the
        // node no longer has is pruned) must still not count as a user change.
        const w2 = makeWindow();
        const stale = MAIN_A();
        stale.elements.push({ id: 'gc', name: 'Get Children', type: 'get-children', x: 300, y: 500, data: { getChildrenMode: 'single', getChildrenSingleIndex: 0 } });
        stale.connections.push({ id: 'c-stale', fromId: 'gc', fromOutput: 'output5', toId: 'out', toInput: 'input1' });
        stale.connections = stale.connections.filter((c) => c.id !== 'c2');
        const env2 = mount(w2, { graphState: stale });
        await wait(800);
        ok('V automatic bookkeeping at load: still clean, nothing stored', env2.statusState() === 'clean' && env2.work() === null && !env2.dirty.includes(true), `${env2.status()} work=${Boolean(env2.work())}`);
        env2.unmount();
        ok('V ...and closing does not store it either', !Object.keys({ ...w2.localStorage }).some((k) => k.startsWith('nodelogic.graph.v2.')));
        const env3 = mount(w2, { graphState: stale });
        await wait(500);
        setValue(w2, env3.input('n1'), '1');
        await wait(600);
        ok('V (precondition) the automatic prune really ran at load', env3.work() && !env3.work().graph.connections.some((c) => c.id === 'c-stale'), env3.work() && env3.work().graph.connections.map((c) => c.id));
        env3.unmount();
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
    console.log(`FAIL  suite crashed: ${error && error.stack || error}`);
    console.log(`\n${pass} passed, ${fail + 1} failed`);
    process.exit(1);
});

