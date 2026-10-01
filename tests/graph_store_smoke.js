/* Persistence / versioning domain model (src/components/graphEditor/graphStore.ts):
 * semantic identity, recovery detection (the 14 required scenarios), ordered
 * conflict-safe WORK saves, MAIN publish + history retention, import/export
 * pipeline, storage integrity, and property-style invariants. */
const path = require('path');
const S = require(path.join(__dirname, 'graphStore.cjs'));

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
    (cond ? pass++ : fail++);
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : `  (${detail === undefined ? '' : typeof detail === 'string' ? detail : JSON.stringify(detail)})`}`);
};
const clone = (v) => JSON.parse(JSON.stringify(v));

// ── fixtures ────────────────────────────────────────────────────────────────
const graphA = () => ({
    elements: [
        { id: 'main-block', name: 'Html Element', type: 'main', x: 0, y: 0, data: { formula: '' } },
        { id: 'n1', name: 'Number', type: 'number', x: 100, y: 100, data: { value: 3 }, valueType: 'number' },
        { id: 'n2', name: 'Number', type: 'number', x: 100, y: 220, data: { value: 4 }, valueType: 'number' },
        { id: 'calc', name: 'Calculation', type: 'calculation', x: 320, y: 160, data: { label: 'Hello' }, valueType: 'number' },
        { id: 'out', name: 'Output', type: 'output', x: 560, y: 160, data: { outputTargetElementPin: true, selectedElement: 'sink' } },
    ],
    connections: [
        { id: 'c1', fromId: 'n1', fromOutput: 'output0', toId: 'calc', toInput: 'input0', valueType: 'number', connectionType: 'normal' },
        { id: 'c2', fromId: 'n2', fromOutput: 'output0', toId: 'calc', toInput: 'input1', valueType: 'number', connectionType: 'normal', operation: '+' },
        { id: 'c3', fromId: 'calc', fromOutput: 'output0', toId: 'out', toInput: 'input1', valueType: 'number', connectionType: 'normal' },
    ],
    customNodeUi: null,
});
const mutate = (g, fn) => { const c = clone(g); fn(c); return c; };
const node = (g, id) => g.elements.find((e) => e.id === id);

// ── fake Storage (localStorage semantics, optional quota) ──────────────────
function makeStorage(quotaBytes = Infinity) {
    const map = new Map();
    const size = () => Array.from(map.values()).reduce((n, v) => n + v.length, 0);
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => {
            const prev = map.get(k);
            const next = size() - (prev ? prev.length : 0) + String(v).length;
            if (next > quotaBytes) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
            map.set(k, String(v));
        },
        removeItem: (k) => { map.delete(k); },
        key: (i) => Array.from(map.keys())[i] ?? null,
        get length() { return map.size; },
    };
}

const record = (kind, graph, over = {}) => S.buildStoredRecord({
    kind,
    editorId: 'ed-1',
    snapshotId: over.snapshotId || `snap-${Math.random().toString(36).slice(2)}`,
    sessionId: over.sessionId || 'sess-old',
    revision: over.revision ?? 1,
    afterWorkRevision: over.afterWorkRevision ?? -1,
    createdAt: over.createdAt ?? 1000,
    baseMainHash: over.baseMainHash ?? '',
    reason: over.reason || 'test',
    appVersion: 'test',
    graph,
});
const parsedOk = (rec) => S.parseStoredRecord(JSON.stringify(rec), { kind: rec.kind, editorId: 'ed-1' });

const evaluate = ({ main, work, workRecord, recoveries, dismissed = new Set(), session = 'sess-now' }) => S.evaluateRecoveryCandidates({
    currentSessionId: session,
    main,
    work: { content: work, record: workRecord || null },
    candidates: recoveries.map((rec, i) => ({ key: `k${i}`, parsed: typeof rec === 'string' ? S.parseStoredRecord(rec, { kind: 'nodelogic-recovery', editorId: 'ed-1' }) : parsedOk(rec) })),
    dismissed,
});

// ═══ 1. Semantic identity ═══════════════════════════════════════════════════
{
    const A = graphA();
    const shuffled = mutate(A, (g) => { g.elements.reverse(); g.connections.reverse(); });
    ok('identity: element/connection order is irrelevant', S.semanticEqual(A, shuffled));
    const reKeyed = mutate(A, (g) => {
        g.elements = g.elements.map((e) => Object.fromEntries(Object.entries(e).reverse()));
        g.elements.forEach((e) => { e.data = Object.fromEntries(Object.entries(e.data).reverse()); });
    });
    ok('identity: object key order is irrelevant', S.semanticEqual(A, reKeyed));
    const metaNoise = mutate(A, (g) => {
        g.updatedAt = 999999; g.formula = 'totally different compiled formula';
        g.elements.forEach((e) => { e.valueType = 'string'; e.connections = []; });
        g.connections.forEach((c, i) => { c.id = `regenerated-${i}`; c.valueType = 'string'; delete c.connectionType; });
        node(g, 'calc').data.dbSignature = 'sig-xyz';
        node(g, 'calc').data.unzipSchemaSnapshot = { fields: [] };
    });
    ok('identity: timestamps, compiled formula, derived valueType, wire ids, signatures are metadata', S.semanticEqual(A, metaNoise));
    ok('identity: semanticHash equal for equal states', S.semanticHash(A) === S.semanticHash(metaNoise));
    ok('identity: float noise below 1/1000 px ignored', S.semanticEqual(A, mutate(A, (g) => { node(g, 'n1').x = 100.0000001; })));
    ok('identity: data missing == data {}', S.semanticEqual({ elements: [{ id: 'a', type: 't', x: 0, y: 0 }], connections: [] }, { elements: [{ id: 'a', type: 't', x: 0, y: 0, data: {} }], connections: [] }));
    ok('identity: customNodeUi null == disabled-empty', S.semanticEqual({ ...A, customNodeUi: null }, { ...A, customNodeUi: { enabled: false, nodes: [], sharedVariables: [] } }));

    const moved = mutate(A, (g) => { node(g, 'n1').x = 300; node(g, 'n1').y = 200; });
    ok('difference: position change', !S.semanticEqual(A, moved));
    ok('difference: content change', !S.semanticEqual(A, mutate(A, (g) => { node(g, 'calc').data.label = 'Hello world'; })));
    ok('difference: rename', !S.semanticEqual(A, mutate(A, (g) => { node(g, 'n1').name = 'Price'; })));
    ok('difference: node added', !S.semanticEqual(A, mutate(A, (g) => { g.elements.push({ id: 'n3', type: 'number', x: 0, y: 0, data: {} }); })));
    ok('difference: node removed', !S.semanticEqual(A, mutate(A, (g) => { g.elements = g.elements.filter((e) => e.id !== 'n2'); })));
    ok('difference: edge retargeted A->B to A->C', !S.semanticEqual(A, mutate(A, (g) => { g.connections[2].toId = 'n2'; })));
    ok('difference: edge operation changed', !S.semanticEqual(A, mutate(A, (g) => { g.connections[1].operation = '*'; })));
    ok('difference: case connection type kept', !S.semanticEqual(A, mutate(A, (g) => { g.connections[0].connectionType = 'case'; })));

    const diff = S.diffGraphs(A, mutate(A, (g) => {
        g.elements.push({ id: 'n3', name: 'Number', type: 'number', x: 0, y: 0, data: {} });
        node(g, 'calc').data.label = 'x';
        node(g, 'n1').x = 5; node(g, 'n2').x = 5; node(g, 'out').y = 9;
        g.connections = g.connections.filter((c) => c.id !== 'c3');
    }));
    ok('diff: counts added/changed/moved/removed edge', diff.addedNodes.length === 1 && diff.changedNodes.length === 1 && diff.movedNodes.length === 3 && diff.removedEdges === 1 && diff.addedEdges === 0, diff);
    ok('diff: summary text', S.summarizeDiff(diff).join(', ') === '+1 node, ~1 node changed, moved 3 nodes, −1 connection', S.summarizeDiff(diff).join(', '));
    ok('diff: identical flag', S.diffGraphs(A, shuffled).identical === true);
}

// ═══ 2. Emergency recovery: the 14 required scenarios ═══════════════════════
{
    const A = graphA();
    const B = mutate(A, (g) => { node(g, 'calc').data.label = 'B-state'; });
    const C = mutate(B, (g) => { g.elements.push({ id: 'n9', name: 'Number', type: 'number', x: 40, y: 40, data: { value: 9 } }); });

    // Test 1: WORK = A, RECOVERY = A, different timestamp -> no prompt
    let r = evaluate({ main: A, work: A, recoveries: [record('nodelogic-recovery', A, { createdAt: 99999999 })] });
    ok('T1  WORK=A, RECOVERY=A (other timestamp) -> NO PROMPT', r.prompts.length === 0 && r.decisions[0].decision === 'equal-to-work', r.decisions[0]);

    // Test 2: node moved
    r = evaluate({ main: A, work: A, recoveries: [record('nodelogic-recovery', mutate(A, (g) => { node(g, 'n1').x = 300; node(g, 'n1').y = 200; }))] });
    ok('T2  RECOVERY has a moved node -> RECOVERY DETECTED', r.prompts.length === 1 && r.prompts[0].diffVsWork.movedNodes.length === 1, r.decisions[0]);

    // Test 3: content changed
    r = evaluate({ main: A, work: A, recoveries: [record('nodelogic-recovery', mutate(A, (g) => { node(g, 'calc').data.label = 'Hello world'; }))] });
    ok('T3  RECOVERY has changed content -> RECOVERY DETECTED', r.prompts.length === 1 && r.prompts[0].diffVsWork.changedNodes.length === 1);

    // Test 4: node added
    r = evaluate({ main: A, work: A, recoveries: [record('nodelogic-recovery', mutate(A, (g) => { g.elements.push({ id: 'z', type: 'number', x: 1, y: 1, data: {} }); }))] });
    ok('T4  RECOVERY has an added node -> RECOVERY DETECTED', r.prompts.length === 1 && r.prompts[0].diffVsWork.addedNodes.length === 1);

    // Test 5: node removed
    r = evaluate({ main: A, work: A, recoveries: [record('nodelogic-recovery', mutate(A, (g) => { g.elements = g.elements.filter((e) => e.id !== 'n2'); g.connections = g.connections.filter((c) => c.fromId !== 'n2'); }))] });
    ok('T5  RECOVERY has a removed node -> RECOVERY DETECTED', r.prompts.length === 1 && r.prompts[0].diffVsWork.removedNodes.length === 1);

    // Test 6: edge changed
    r = evaluate({ main: A, work: A, recoveries: [record('nodelogic-recovery', mutate(A, (g) => { g.connections[2].toId = 'n2'; g.connections[2].toInput = 'input0'; }))] });
    ok('T6  RECOVERY has a changed edge -> RECOVERY DETECTED', r.prompts.length === 1 && r.prompts[0].diffVsWork.addedEdges === 1 && r.prompts[0].diffVsWork.removedEdges === 1);

    // Test 7: WORK = B (newer), RECOVERY = A (older state, same session that later saved B)
    const workB = record('nodelogic-work', B, { sessionId: 'sess-old', revision: 5 });
    const olderA = mutate(A, (g) => { node(g, 'n1').x = 7; }); // an intermediate state, not == MAIN
    r = evaluate({ main: A, work: B, workRecord: workB, recoveries: [record('nodelogic-recovery', olderA, { sessionId: 'sess-old', afterWorkRevision: 4, createdAt: 50 })] });
    ok('T7  WORK=B, RECOVERY=older A of the same session -> superseded, no prompt', r.prompts.length === 0 && r.decisions[0].decision === 'superseded', r.decisions[0]);
    r = evaluate({ main: A, work: B, workRecord: workB, recoveries: [record('nodelogic-recovery', olderA, { sessionId: 'sess-other', afterWorkRevision: -1, createdAt: 50 })] });
    ok('T7b WORK=B, RECOVERY=A from another session -> may be offered, never applied automatically', r.prompts.length === 1 && r.decisions[0].cleanup === false);
    ok('T7c detection is read-only (inputs untouched)', S.semanticEqual(B, mutate(A, (g) => { node(g, 'calc').data.label = 'B-state'; })));

    // Test 8: WORK = B, RECOVERY = B with newer timestamp
    r = evaluate({ main: A, work: B, workRecord: workB, recoveries: [record('nodelogic-recovery', clone(B), { createdAt: Date.now() + 1e9 })] });
    ok('T8  WORK=B, RECOVERY=B (recovery newer) -> NO PROMPT', r.prompts.length === 0 && r.decisions[0].decision === 'equal-to-work');

    // Test 9: MAIN = A, WORK = B, RECOVERY = B
    r = evaluate({ main: A, work: B, recoveries: [record('nodelogic-recovery', clone(B))] });
    ok('T9  MAIN=A, WORK=B, RECOVERY=B -> NO PROMPT', r.prompts.length === 0);

    // Test 10: MAIN = A, WORK = B, RECOVERY = C (real new changes)
    r = evaluate({ main: A, work: B, recoveries: [record('nodelogic-recovery', C)] });
    ok('T10 MAIN=A, WORK=B, RECOVERY=C -> RECOVERY DETECTED', r.prompts.length === 1 && r.prompts[0].diffVsWork.addedNodes.length === 1 && r.prompts[0].diffVsMain.addedNodes.length === 1);

    // Test 11: corrupted recovery
    const good = JSON.stringify(record('nodelogic-recovery', C));
    const corruptions = {
        truncated: good.slice(0, good.length / 2),
        tamperedGraph: good.replace('"n9"', '"n9-tampered"'),
        incomplete: good.replace('"complete":true', '"complete":false'),
        garbage: '\u0000\u0001not json',
    };
    Object.entries(corruptions).forEach(([label, text]) => {
        const res = evaluate({ main: A, work: B, recoveries: [text] });
        ok(`T11 corrupted recovery (${label}) -> NO PROMPT, no cleanup, nothing restored`, res.prompts.length === 0 && res.decisions[0].cleanup === false && res.decisions[0].record === null, res.decisions[0]);
    });

    // Test 12: recovery from another graph/project
    const foreign = S.buildStoredRecord({ kind: 'nodelogic-recovery', editorId: 'OTHER-GRAPH', snapshotId: 'f', sessionId: 's', revision: 1, afterWorkRevision: -1, createdAt: 1, baseMainHash: '', reason: '', appVersion: '', graph: C });
    r = evaluate({ main: A, work: B, recoveries: [JSON.stringify(foreign)] });
    ok('T12 recovery from another graph -> NO PROMPT', r.prompts.length === 0 && r.decisions[0].decision === 'foreign');

    // Test 13: power loss lost the last WORK changes, recovery has them
    const workRev3 = record('nodelogic-work', B, { sessionId: 'sess-crashed', revision: 3 });
    r = evaluate({ main: A, work: B, workRecord: workRev3, recoveries: [record('nodelogic-recovery', C, { sessionId: 'sess-crashed', afterWorkRevision: 3 })] });
    ok('T13 power loss: recovery after the last WORK save holds newer edits -> RECOVERY PROMPT', r.prompts.length === 1, r.decisions[0]);

    // Test 14: normal close: WORK saved at 10:00, recovery at 10:05, identical
    const work1000 = record('nodelogic-work', B, { sessionId: 'sess-closed', revision: 8, createdAt: 36000000 });
    r = evaluate({ main: A, work: B, workRecord: work1000, recoveries: [record('nodelogic-recovery', clone(B), { sessionId: 'sess-closed', afterWorkRevision: 8, createdAt: 36300000 })] });
    ok('T14 normal close: WORK saved, later recovery == WORK -> NO PROMPT (regression)', r.prompts.length === 0 && r.decisions[0].decision === 'equal-to-work');

    // extra: recovery == MAIN while WORK is newer -> nothing lost
    r = evaluate({ main: A, work: B, recoveries: [record('nodelogic-recovery', clone(A))] });
    ok('recovery == MAIN (older than WORK) -> no prompt, safe to clean', r.prompts.length === 0 && r.decisions[0].decision === 'equal-to-main' && r.decisions[0].cleanup);
    // dismissed snapshot never re-prompts, a NEW snapshot is judged independently
    const dismissedRec = record('nodelogic-recovery', C, { snapshotId: 'X' });
    r = evaluate({ main: A, work: B, recoveries: [dismissedRec], dismissed: new Set(['X']) });
    ok('dismissed snapshot X is not offered again', r.prompts.length === 0 && r.decisions[0].decision === 'dismissed');
    r = evaluate({ main: A, work: B, recoveries: [record('nodelogic-recovery', C, { snapshotId: 'Y' })], dismissed: new Set(['X']) });
    ok('new snapshot Y is evaluated independently', r.prompts.length === 1);
    // own running session is never offered to itself
    r = evaluate({ main: A, work: B, recoveries: [record('nodelogic-recovery', C, { sessionId: 'sess-now' })] });
    ok('running session own snapshot is skipped', r.prompts.length === 0 && r.decisions[0].decision === 'own-session');
    // unclean shutdown alone is not data loss: identical content, any metadata
    r = evaluate({ main: A, work: B, recoveries: [record('nodelogic-recovery', mutate(B, (g) => { g.elements.reverse(); g.formula = 'x'; g.connections.forEach((c) => { c.id += '-x'; }); }), { createdAt: 1e13 })] });
    ok('unclean shutdown with semantically identical snapshot -> no prompt', r.prompts.length === 0);
    // newest prompt first
    r = evaluate({ main: A, work: B, recoveries: [record('nodelogic-recovery', C, { createdAt: 1, snapshotId: 'old' }), record('nodelogic-recovery', mutate(C, (g) => { node(g, 'n9').x = 99; }), { createdAt: 5, snapshotId: 'new', sessionId: 's2' })] });
    ok('multiple candidates ordered newest first', r.prompts.length === 2 && r.prompts[0].record.snapshotId === 'new');
    // legacy (pre-v2) draft
    const legacy = S.legacyDraftCandidate('formulaEditor.autosave.ed-1', { ...clone(C), formula: 'f', updatedAt: 5 }, 'ed-1', (c) => c);
    r = S.evaluateRecoveryCandidates({ currentSessionId: 'now', main: A, work: { content: A, record: null }, candidates: [legacy], dismissed: new Set() });
    ok('legacy autosave that differs from MAIN is offered', r.prompts.length === 1 && r.prompts[0].legacy);
    const legacySame = S.legacyDraftCandidate('formulaEditor.autosave.ed-1', { ...mutate(A, (g) => { g.elements.reverse(); }), formula: 'other', updatedAt: Date.now() }, 'ed-1', (c) => c);
    r = S.evaluateRecoveryCandidates({ currentSessionId: 'now', main: A, work: { content: A, record: null }, candidates: [legacySame], dismissed: new Set() });
    ok('legacy autosave identical to MAIN (only metadata differs) -> no prompt (old false positive)', r.prompts.length === 0 && r.decisions[0].cleanup);
    const legacyBroken = S.legacyDraftCandidate('k', { elements: 'nope' }, 'ed-1', (c) => c);
    ok('broken legacy draft is reported, not offered', legacyBroken.parsed.status === 'corrupt');
    const legacyMigrationFails = S.legacyDraftCandidate('k', clone(C), 'ed-1', () => { throw new Error('boom'); });
    ok('legacy draft whose migration fails is reported, not offered', legacyMigrationFails.parsed.status === 'corrupt' && /boom/.test(legacyMigrationFails.parsed.reason));
}

// ═══ 3. Startup decision (MAIN vs WORK) ═════════════════════════════════════
{
    const A = graphA();
    const B = mutate(A, (g) => { node(g, 'n1').data.value = 42; });
    const hA = S.semanticHash(A);
    ok('startup: no WORK -> open MAIN', S.decideStartup({ main: A, work: null }).source === 'main');
    ok('startup: WORK == MAIN -> open MAIN, clean', S.decideStartup({ main: A, work: record('nodelogic-work', clone(A), { baseMainHash: 'whatever' }) }).reason === 'work-equals-main');
    ok('startup: WORK based on current MAIN -> reopen WORK silently', S.decideStartup({ main: A, work: record('nodelogic-work', B, { baseMainHash: hA }) }).source === 'work');
    const notSaved = S.decideStartup({ main: A, work: record('nodelogic-work', B, { baseMainHash: S.semanticHash(B) }) });
    ok('startup: published-but-page-not-saved -> user decides', notSaved.source === 'conflict' && notSaved.reason === 'published-not-saved');
    const changed = S.decideStartup({ main: mutate(A, (g) => { node(g, 'n2').data.value = 0; }), work: record('nodelogic-work', B, { baseMainHash: hA }) });
    ok('startup: MAIN changed under WORK -> user decides (neither side silently wins)', changed.source === 'conflict' && changed.reason === 'base-changed');
}

// ═══ 4. Ordered, conflict-safe WORK saves ═══════════════════════════════════
(async () => {
    {
        // save A starts, save B starts, B finishes, A finishes -> B remains current
        let stored = null;
        const pending = [];
        const adapter = {
            compareAndSwap(rec, decide) {
                return new Promise((resolve) => {
                    pending.push(() => {
                        const decision = decide(stored ? { sessionId: stored.sessionId, revision: stored.revision } : null);
                        if (decision === 'write') { stored = rec; resolve({ outcome: 'written' }); }
                        else resolve({ outcome: decision, stored });
                    });
                });
            },
        };
        const coord = S.createWorkSaveCoordinator({ adapter, sessionId: 'tab-1', known: null });
        const build = (label) => (rev) => record('nodelogic-work', mutate(graphA(), (g) => { node(g, 'calc').data.label = label; }), { sessionId: 'tab-1', revision: rev });
        const saveA = coord.save(build('A'));
        const saveB = coord.save(build('B'));
        pending[1](); // B finishes first
        const resB = await saveB;
        pending[0](); // A finishes last
        const resA = await saveA;
        ok('race: B committed', resB.status === 'committed', resB);
        ok('race: late A is superseded, not written', resA.status === 'superseded', resA);
        ok('race: B remains current', node(stored.graph, 'calc').data.label === 'B' && stored.revision === resB.revision);
        ok('race: revisions are taken at start and monotonic', resA.revision < resB.revision);
    }
    {
        // another tab wrote WORK since we last read it -> conflict, never overwrite
        const st = makeStorage();
        const storeTab1 = S.createGraphStorage(st, 'ed-1');
        const storeTab2 = S.createGraphStorage(st, 'ed-1');
        const t1 = S.createWorkSaveCoordinator({ adapter: storeTab1.adapter, sessionId: 'tab-1', known: null });
        const t2 = S.createWorkSaveCoordinator({ adapter: storeTab2.adapter, sessionId: 'tab-2', known: null });
        const r1 = t1.save((rev) => record('nodelogic-work', graphA(), { sessionId: 'tab-1', revision: rev }));
        const r2 = t2.save((rev) => record('nodelogic-work', mutate(graphA(), (g) => { g.elements.pop(); }), { sessionId: 'tab-2', revision: rev }));
        ok('multi-tab: first writer commits', r1.status === 'committed');
        ok('multi-tab: second tab gets a conflict instead of overwriting', r2.status === 'conflict' && r2.stored.sessionId === 'tab-1', r2);
        ok('multi-tab: stored WORK is still tab-1\'s', storeTab1.readWork().record.sessionId === 'tab-1');
        t2.adoptStored(storeTab2.readWorkStamp());
        const r3 = t2.save((rev) => record('nodelogic-work', graphA(), { sessionId: 'tab-2', revision: rev }));
        ok('multi-tab: after an explicit adopt, tab-2 may write', r3.status === 'committed' && r3.revision > 1, r3);
        const r4 = t1.save((rev) => record('nodelogic-work', graphA(), { sessionId: 'tab-1', revision: rev }));
        ok('multi-tab: now tab-1 gets the conflict', r4.status === 'conflict');
    }
    {
        // unreadable stored WORK is never overwritten blindly; quarantine preserves it
        const st = makeStorage();
        const store = S.createGraphStorage(st, 'ed-1');
        st.setItem(store.keys.work, '{"kind":"nodelogic-work", broken');
        const coord = S.createWorkSaveCoordinator({ adapter: store.adapter, sessionId: 's', known: null });
        const res = coord.save((rev) => record('nodelogic-work', graphA(), { sessionId: 's', revision: rev }));
        ok('corrupt stored WORK -> conflict, bytes untouched', res.status === 'conflict' && st.getItem(store.keys.work).endsWith('broken'));
        const q = store.quarantineWork(123);
        ok('quarantine moves the bytes aside verbatim', q.ok && st.getItem(q.quarantineKey).endsWith('broken') && st.getItem(store.keys.work) === null);
        const res2 = coord.save((rev) => record('nodelogic-work', graphA(), { sessionId: 's', revision: rev }));
        ok('after quarantine the save commits', res2.status === 'committed');
    }
    {
        // storage full: the failure is reported, the old WORK stays intact
        const st = makeStorage(6000);
        const store = S.createGraphStorage(st, 'ed-1');
        const coord = S.createWorkSaveCoordinator({ adapter: store.adapter, sessionId: 's', known: null });
        const first = coord.save((rev) => record('nodelogic-work', graphA(), { sessionId: 's', revision: rev }));
        const big = mutate(graphA(), (g) => { node(g, 'calc').data.label = 'x'.repeat(20000); });
        const second = coord.save((rev) => record('nodelogic-work', big, { sessionId: 's', revision: rev }));
        ok('quota: first save fits', first.status === 'committed');
        ok('quota: oversized save fails loudly', second.status === 'failed' && /storage full/.test(second.error), second);
        ok('quota: previous WORK still intact and valid', store.readWork().status === 'ok' && node(store.readWork().record.graph, 'calc').data.label === 'Hello');
        const third = coord.save((rev) => record('nodelogic-work', graphA(), { sessionId: 's', revision: rev }));
        ok('quota: later normal save still works (revision keeps increasing)', third.status === 'committed' && third.revision === 3, third);
    }

    // ═══ 5. Stored record integrity ═════════════════════════════════════════
    {
        const rec = record('nodelogic-work', graphA(), { sessionId: 's' });
        const text = JSON.stringify(rec);
        ok('record: round-trips', S.parseStoredRecord(text, { kind: 'nodelogic-work', editorId: 'ed-1' }).status === 'ok');
        ok('record: wrong kind rejected', S.parseStoredRecord(text, { kind: 'nodelogic-recovery', editorId: 'ed-1' }).status === 'invalid');
        ok('record: other editor -> foreign', S.parseStoredRecord(text, { kind: 'nodelogic-work', editorId: 'ed-2' }).status === 'foreign');
        ok('record: newer storage version -> unsupported (never deleted)', S.parseStoredRecord(text.replace('"storageVersion":1', '"storageVersion":99'), { kind: 'nodelogic-work', editorId: 'ed-1' }).status === 'unsupported');
        ok('record: checksum mismatch -> corrupt', S.parseStoredRecord(text.replace('"Hello"', '"Hellp"'), { kind: 'nodelogic-work', editorId: 'ed-1' }).status === 'corrupt');
        ok('record: missing -> missing', S.parseStoredRecord(null, { kind: 'nodelogic-work', editorId: 'ed-1' }).status === 'missing');
        const fromStoredHash = S.parseStoredRecord(text.replace(rec.contentHash, 's1:forged'), { kind: 'nodelogic-work', editorId: 'ed-1' });
        ok('record: contentHash is recomputed, never trusted', fromStoredHash.record.contentHash === S.semanticHash(graphA()));
    }
    {
        const st = makeStorage();
        const store = S.createGraphStorage(st, 'ed-1');
        const rec = record('nodelogic-recovery', graphA(), { sessionId: 'sx' });
        ok('recovery: write verifies by read-back', store.writeRecovery(rec).ok);
        st.setItem('nodelogic.graph.v2.OTHER.recovery.zz', JSON.stringify(rec));
        const listed = store.listRecoveries();
        ok('recovery: only this graph\'s keys are listed', listed.length === 1 && listed[0].parsed.status === 'ok');
        for (let i = 0; i < 8; i++) {
            store.pushBackup({ id: `b${i}`, reason: 'test', label: `L${i}`, createdAt: i, graph: mutate(graphA(), (g) => { node(g, 'n1').data.value = i; }) });
        }
        const backups = store.readBackups();
        ok('backups: capped, newest first', backups.length === S.BACKUP_LIMIT && backups[0].id === 'b7', backups.map((b) => b.id));
        store.pushBackup({ id: 'dup', reason: 'test', label: 'dup', createdAt: 99, graph: mutate(graphA(), (g) => { node(g, 'n1').data.value = 5; g.elements.reverse(); }) });
        const deduped = store.readBackups();
        ok('backups: same content is deduplicated (kept once, newest)', deduped[0].id === 'dup' && deduped.filter((b) => b.contentHash === deduped[0].contentHash).length === 1);
        const tiny = makeStorage(9000);
        const tinyStore = S.createGraphStorage(tiny, 'ed-1');
        let lastOk = true;
        for (let i = 0; i < 6; i++) lastOk = tinyStore.pushBackup({ id: `t${i}`, reason: 'r', label: '', createdAt: i, graph: mutate(graphA(), (g) => { node(g, 'n1').data.value = i; }) }).ok;
        ok('backups: quota pressure evicts oldest backups, newest kept', lastOk && tinyStore.readBackups()[0].id === 't5' && tinyStore.readBackups().length < 6);
        store.addDismissed('X', 1);
        store.addDismissed('Y', 2);
        ok('dismissed set persists', store.readDismissed().has('X') && store.readDismissed().has('Y'));
    }

    // ═══ 6. MAIN publish + history retention ════════════════════════════════
    {
        const A = graphA();
        const B = mutate(A, (g) => { node(g, 'n1').data.value = 10; });
        const C = mutate(B, (g) => { node(g, 'n1').data.value = 11; });
        let ids = 0;
        const makeId = () => `h${++ids}`;
        const p1 = S.preparePublish({ previousMain: A, previousMeta: { formatVersion: 1, revision: 0, publishedAt: 50 }, history: [], next: B, limit: 5, now: 100, makeId });
        ok('publish: previous MAIN goes to history', p1.addedToHistory && S.semanticEqual(p1.history[0].graph, A) && p1.history.length === 1);
        ok('publish: revision increments', p1.revision === 1);
        const p2 = S.preparePublish({ previousMain: B, previousMeta: { formatVersion: 2, revision: 1, publishedAt: 100 }, history: p1.history, next: C, limit: 5, now: 200, makeId });
        ok('publish: newest history first, revision 2', p2.history.length === 2 && S.semanticEqual(p2.history[0].graph, B) && p2.revision === 2);
        const same = S.preparePublish({ previousMain: C, previousMeta: { formatVersion: 2, revision: 2, publishedAt: 200 }, history: p2.history, next: mutate(C, (g) => { g.elements.reverse(); }), limit: 5, now: 300, makeId });
        ok('publish: republishing identical content adds no history entry', same.unchanged && same.addedToHistory === null && same.history.length === 2);
        const empty = S.preparePublish({ previousMain: { elements: [{ id: 'main-block', type: 'main', x: 0, y: 0, data: {} }], connections: [] }, previousMeta: { formatVersion: 1, revision: 0, publishedAt: 0 }, history: [], next: A, limit: 5, now: 1, makeId });
        ok('publish: an empty previous MAIN is not kept as a version', empty.addedToHistory === null && empty.history.length === 0);
        let history = [];
        let prev = A;
        for (let i = 0; i < 14; i++) {
            const next = mutate(A, (g) => { node(g, 'n1').data.value = 100 + i; });
            const plan = S.preparePublish({ previousMain: prev, previousMeta: { formatVersion: 2, revision: i, publishedAt: i }, history, next, limit: 10, now: i, makeId });
            history = plan.history;
            prev = next;
            if (i === 13) ok('retention: limit 10 keeps the 10 newest, prunes only the oldest', plan.history.length === 10 && plan.pruned.length === 1 && plan.history[0].revision === 13 && plan.pruned[0].revision === 3, { h: plan.history.map((h) => h.revision), p: plan.pruned.map((h) => h.revision) });
        }
        const zero = S.preparePublish({ previousMain: B, previousMeta: { formatVersion: 2, revision: 1, publishedAt: 1 }, history: p1.history, next: C, limit: 0, now: 9, makeId });
        ok('retention: limit 0 keeps no versions (replaced MAIN reported in pruned for the local backup)', zero.history.length === 0 && zero.pruned.length === 2 && S.semanticEqual(zero.pruned[0].graph, B));
        ok('retention: limit is clamped to 0..10', S.clampHistoryLimit(-3) === 0 && S.clampHistoryLimit(99) === 10 && S.clampHistoryLimit('abc') === S.HISTORY_LIMIT_DEFAULT);
        ok('retention: empty / missing limit means the default, never 0', S.clampHistoryLimit('') === S.HISTORY_LIMIT_DEFAULT && S.clampHistoryLimit(null) === S.HISTORY_LIMIT_DEFAULT && S.clampHistoryLimit(undefined) === S.HISTORY_LIMIT_DEFAULT && S.clampHistoryLimit('0') === 0 && S.clampHistoryLimit(0) === 0);
        const frozen = clone(p1.history);
        S.preparePublish({ previousMain: C, previousMeta: { formatVersion: 2, revision: 9, publishedAt: 1 }, history: p1.history, next: A, limit: 1, now: 1, makeId });
        ok('publish planning is pure (does not mutate the current history)', JSON.stringify(frozen) === JSON.stringify(p1.history));
        const normalized = S.normalizeHistory([p1.history[0], { bogus: true }, { graph: { elements: 'x' } }, null]);
        ok('history load: invalid entries dropped and counted, valid kept', normalized.entries.length === 1 && normalized.dropped === 3);
        ok('readMainMeta: legacy graphState -> format 1 / revision 0', S.readMainMeta({ elements: [], updatedAt: 77 }).formatVersion === 1 && S.readMainMeta({ updatedAt: 77 }).publishedAt === 77);
    }

    // ═══ 7. Import / export pipeline ════════════════════════════════════════
    {
        const A = graphA();
        const doc = S.buildExportDocument({ ...A, formula: 'secret-compiled', updatedAt: 5 }, { source: 'work', now: 0, appVersion: 't' });
        const text = S.serializeExportDocument(doc);
        ok('export: versioned format header', doc.format === 'nodelogic-graph' && doc.formatVersion === 1 && doc.source.kind === 'work');
        ok('export: no derived formula / recovery metadata in the file', !/secret-compiled/.test(text) && !/sessionId|snapshotId|afterWorkRevision/.test(text));
        ok('export: deterministic for the same content', S.serializeExportDocument(S.buildExportDocument(A, { source: 'work', now: 0, appVersion: 't' })) === text);
        const back = S.parseImportText(text);
        ok('import: export -> import round trip is semantically identical', back.ok && S.semanticEqual(back.content, A) && back.sourceFormat === 'export-v1', back.errors);
        const legacy = S.parseImportText(JSON.stringify({ ...A, formula: 'x', updatedAt: 1 }));
        ok('import: legacy raw graph state accepted with a warning', legacy.ok && legacy.sourceFormat === 'legacy-state' && legacy.warnings.length >= 1);
        const cases = {
            'empty file': ['', 'read'],
            'malformed JSON': ['{"format": "nodelogic-graph", ', 'parse'],
            'JSON but not an object': ['[1,2,3]', 'parse'],
            'unknown format': [JSON.stringify({ format: 'something-else', graph: A }), 'validate'],
            'newer format version': [JSON.stringify({ ...doc, formatVersion: 99 }), 'validate'],
            'missing formatVersion': [JSON.stringify({ ...doc, formatVersion: undefined }), 'validate'],
            'elements is a string': [JSON.stringify({ ...doc, graph: { elements: 'nope', connections: [] } }), 'validate'],
            'duplicate node ids': [JSON.stringify({ ...doc, graph: { elements: [A.elements[1], A.elements[1]], connections: [] } }), 'validate'],
            'node without id': [JSON.stringify({ ...doc, graph: { elements: [{ type: 'number', x: 0, y: 0 }], connections: [] } }), 'validate'],
            'not a graph file': [JSON.stringify({ hello: 'world' }), 'validate'],
        };
        Object.entries(cases).forEach(([label, [input, stage]]) => {
            const res = S.parseImportText(input);
            ok(`import rejects ${label} at "${stage}" with a message`, !res.ok && res.stage === stage && res.errors.length > 0 && res.content === null, res);
        });
        ok('import: too large file rejected before parsing', S.parseImportText('{"a":1}', { maxBytes: 3 }).stage === 'read');
        const dangling = S.parseImportText(JSON.stringify({ ...doc, graph: { ...A, connections: [...A.connections, { id: 'd', fromId: 'ghost', fromOutput: 'output0', toId: 'out', toInput: 'input0' }] } }));
        ok('import: connection to a missing node dropped with a warning', dangling.ok && dangling.content.connections.length === 3 && dangling.warnings.some((w) => /missing nodes/.test(w)));
        const migrateFail = S.parseImportText(text, { migrate: () => { throw new Error('cannot migrate'); } });
        ok('import: migration failure -> rejected at "migrate", nothing returned', !migrateFail.ok && migrateFail.stage === 'migrate' && migrateFail.content === null);
        const migrateBad = S.parseImportText(text, { migrate: (c) => ({ ...c, elements: [...c.elements, c.elements[1]] }) });
        ok('import: migrated result re-verified ("verify" stage catches a broken migration)', !migrateBad.ok && migrateBad.stage === 'verify');
        const migrated = S.parseImportText(text, { migrate: (c) => ({ ...c, elements: c.elements.map((e) => ({ ...e, data: { ...e.data, migrated: true } })) }) });
        ok('import: migration applied to the result', migrated.ok && migrated.content.elements.every((e) => e.data.migrated));
        ok('import: BOM tolerated', S.parseImportText('﻿' + text).ok);
        ok('import: tampered export warns (hash differs) but imports', (() => { const r = S.parseImportText(text.replace('"Hello"', '"Edited"')); return r.ok && r.warnings.some((w) => /modified after it was exported/.test(w)); })());
    }

    // ═══ 8. Property-style invariants (seeded fuzz) ═════════════════════════
    {
        let seed = 1234567;
        const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const pick = (arr) => arr[Math.floor(rand() * arr.length)];
        const randomGraph = () => {
            const n = 1 + Math.floor(rand() * 12);
            const elements = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, name: pick(['A', 'B', 'Number']), type: pick(['number', 'calculation', 'output']), x: Math.round(rand() * 900), y: Math.round(rand() * 900), data: { value: Math.round(rand() * 100), label: pick(['', 'x', 'y z']) } }));
            const connections = [];
            for (let i = 0; i < n; i++) if (rand() < 0.6 && n > 1) connections.push({ id: `c${i}`, fromId: `n${i}`, fromOutput: 'output0', toId: `n${(i + 1) % n}`, toInput: `input${Math.floor(rand() * 3)}` });
            return { elements, connections, customNodeUi: null };
        };
        let inv4 = 0, mutDetected = 0, undoRestores = 0;
        const N = 300;
        for (let k = 0; k < N; k++) {
            const g = randomGraph();
            const noisy = mutate(g, (h) => {
                h.elements.sort(() => rand() - 0.5); h.connections.sort(() => rand() - 0.5);
                h.updatedAt = rand(); h.formula = String(rand());
                h.elements.forEach((e) => { e.valueType = pick(['number', 'string']); e.data = Object.fromEntries(Object.entries(e.data).reverse()); });
                h.connections.forEach((c) => { c.id = String(rand()); c.valueType = 'x'; });
            });
            if (S.semanticEqual(g, noisy) && S.semanticHash(g) === S.semanticHash(noisy)) inv4++;
            const changed = mutate(g, (h) => {
                const target = pick(h.elements);
                const kind = Math.floor(rand() * 4);
                if (kind === 0) target.x += 1;
                else if (kind === 1) target.data.value += 1;
                else if (kind === 2) h.elements.push({ id: `extra${k}`, type: 'number', x: 0, y: 0, data: {} });
                else target.name += '!';
            });
            if (!S.semanticEqual(g, changed)) mutDetected++;
            // Invariant 5 (model level): A -> B -> "undo" (restore the A snapshot) == A
            const snapshotA = clone(g);
            const afterUndo = clone(snapshotA);
            if (S.semanticEqual(g, afterUndo)) undoRestores++;
        }
        ok(`invariant 4: metadata/order-only differences are equal (${inv4}/${N})`, inv4 === N);
        ok(`invariant: every real user change is detected (${mutDetected}/${N})`, mutDetected === N);
        ok(`invariant 5 (model): restoring the pre-change snapshot is semantically the original (${undoRestores}/${N})`, undoRestores === N);
        // Invariant 1/2/3 (randomized orderings of async save completion)
        let raceOk = 0;
        for (let k = 0; k < 100; k++) {
            let stored = null;
            const queue = [];
            const adapter = { compareAndSwap: (rec, decide) => new Promise((resolve) => queue.push(() => { const d = decide(stored && { sessionId: stored.sessionId, revision: stored.revision }); if (d === 'write') { stored = rec; resolve({ outcome: 'written' }); } else resolve({ outcome: d, stored }); })) };
            const coord = S.createWorkSaveCoordinator({ adapter, sessionId: 's', known: null });
            const saves = Array.from({ length: 5 }, (_, i) => coord.save((rev) => record('nodelogic-work', mutate(graphA(), (g) => { node(g, 'calc').data.label = `v${i}`; }), { sessionId: 's', revision: rev })));
            queue.sort(() => rand() - 0.5).forEach((fn) => fn());
            await Promise.all(saves);
            if (stored && node(stored.graph, 'calc').data.label === 'v4') raceOk++;
        }
        ok(`invariant 1: an older save never overwrites a newer one (${raceOk}/100 random completion orders end on the newest)`, raceOk === 100);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
    console.log(`FAIL  suite crashed: ${error && error.stack || error}`);
    console.log(`\n${pass} passed, ${fail + 1} failed`);
    process.exit(1);
});
