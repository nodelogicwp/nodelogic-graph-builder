# Graph persistence, versioning and recovery

Audit and architecture of how the graph editor stores user work: MAIN / WORK,
Save Graph (publish), version history, emergency recovery, undo/redo,
import/export and migrations. Code: `src/components/graphEditor/graphStore.ts`
(pure rules), `src/components/graphEditor/persistenceUi.tsx` (dialogs and
panels), `src/components/graphEditor.tsx` (wiring), the two hosts
`src/logic-edit.js` (Gutenberg) and `assets/elementor/elementor-logic.js` +
`src/elementor/elementor-editor.jsx` (Elementor).

Guiding rule: never destroy a correct user state before its replacement is
prepared, verified and stored; "newer timestamp" never means "newer data".

---

## A. Architecture before this change

The editor runs in a modal inside a WordPress host:

| Host | Where the graph lives | When it becomes durable |
| --- | --- | --- |
| Gutenberg logic block | block attributes `graphState`, `formula`, `outputConfigs` in `post_content` | when the post is saved (Update) |
| Elementor widget | widget settings `graph_state`, `formula`, `output_configs` in `_elementor_data` | when the Elementor document is saved |

Inside the editor there were **five copies of the graph with no defined
precedence**:

1. host `graphState` (written by Save Graph, template import and "restore draft"),
2. `localStorage formulaEditor.save.<editorId>` (Save Graph, template import, restore),
3. `localStorage formulaEditor.autosave.<editorId>` (5 s pure debounce, only while "dirty"),
4. React state `elements` / `connections`,
5. refs `elementsRef` / `connectionsRef`, re-assigned from the render value on every render.

There were ~170 places mutating the graph directly with `setElements` /
`setConnections`; undo checkpoints were pushed manually at 4 of them, "dirty"
was set at 6.

## B. Issues found

**Critical**

1. *Config edits were never saved anywhere until Save Graph.* Only add / delete /
   move / connect / undo marked the graph dirty (6 of ~170 mutation sites).
   Autosave ran only while dirty, so editing node settings and closing the modal
   lost everything, without a warning.
2. *"Restore Changes" destroyed work in one click*: no confirmation, no undo
   checkpoint, and it overwrote the autosave slot - unrecoverable.
3. *Template import and "Restore draft" wrote MAIN directly* (the block
   attribute) and overwrote both localStorage slots, without confirmation or
   checkpoint.
4. *An empty compile result fell back to the previous formula*: removing all
   outputs and saving kept the old logic running on the page.
5. *Wires deleted by a loading schema*: a DB-backed Unzip's pin types come
   from column metadata loaded asynchronously; until it arrives every column
   reads as `string`, and the stale-wire pruning removed "incompatible" wires.
   It was hidden by the stale refs (6 below) and surfaced once they were fixed.
6. *Stale-ref lost updates*: refs were re-assigned from render values, so a
   mutation computed from a ref could be based on an older render and drop an
   update that was still pending (e.g. a DB signature applied from a promise).
7. *Duplicated Gutenberg logic blocks shared one `editorId`* - one working
   copy, one runtime event scope and one server-side graph lookup for two
   blocks.
8. *Elementor's close button never unmounted React*: no cleanup ran (pending
   saves lost) and every open leaked window listeners (keydown, mouseup).

**High**

9. *False recovery prompts*: the draft check compared `JSON.stringify` of
   states including derived fields (`valueType`, compiled formula) and key
   order. Dismissal was not remembered, so the same draft was offered on every
   open; the "Restore Unsaved Draft" button was shown permanently.
10. *Pure 5 s debounce*: continuous editing was never autosaved; the timer was
    cleared on unmount, losing the last edits.
11. *Automatic bookkeeping created undo steps* (stale-wire pruning, schema
    snapshots, signatures pushed history), so Undo restored states the editor
    immediately "fixed" again.
12. Storage failures (quota, blocked storage) were swallowed by `catch {}`.
13. Re-dragging a wire produced two undo steps; Undo/Redo buttons did not
    re-render when only the stacks changed.
14. Keyboard shortcuts were global for every editor on the page.

**Medium / low**

15. `resolveInitialSnapshot` chose a snapshot by "newest `updatedAt`" and a
    "richness" score - dead code, but exactly the forbidden heuristic (removed).
16. No MAIN history, no file import/export.
17. `onStateChangeRef` was never updated (stale host callback); startup called
    `onFormulaChange` (a write to the host while merely opening the editor).
18. A long node name ran past the node card's right edge.
19. `src/formula-edit.js` is dead (not registered) and reads `state.mainFormula`,
    which the editor never sends.

## C. Data-loss paths (before) and what closes them now

| Path | Now |
| --- | --- |
| Edit settings, close modal | every mutation goes to WORK (stored next tick / within 400 ms), flushed on close, page hide and unload |
| Crash during continuous editing | WORK stored at least every 400 ms while typing; structural edits on the next tick |
| One-click "Restore Changes" | "Discard changes..." with confirmation + diff, local backup, one undo step |
| Template import / draft restore writing MAIN | they replace WORK only (confirmed, backed up, undoable); MAIN changes only via Save Graph |
| Stale formula after removing outputs | publish uses the fresh compile result, even when empty |
| Wires pruned while a schema is loading | unknown is never "changed": no pruning while column metadata is missing |
| Two blocks / tabs sharing storage | unique ids for copies; WORK writes are compare-and-swap, never overwrite another tab |
| Corrupted stored data | checksum + validation; damaged WORK is quarantined byte-for-byte, never loaded and never overwritten |
| Publish failure | MAIN + history are committed in one host update; failure leaves both untouched |
| History pruning | prune happens in the same atomic update that adds the new version |

## D. Target model

```
USER ACTION ─▶ setElements / setConnections ─▶ WORK (in memory: elementsRef / connectionsRef)
                     │ user: undo checkpoint (one per operation)       │
                     │ system: none (derived bookkeeping)              ▼
                     └──────────────────────────────▶ WORK record (localStorage)

WORK ─▶ Save Graph (publish) ─▶ MAIN (block / widget) ─▶ MAIN HISTORY (same host update)

WORK / in-memory state ─▶ RECOVERY snapshot (only when it may not have reached WORK)
```

* **Single source of truth for the working graph**: `elementsRef` /
  `connectionsRef`. They are written only by the setters, eagerly; React state
  is the render projection. Re-assigning them from render values was removed.
* **user vs system mutations**: `setElements` / `setConnections` are user
  edits; effects that derive data (`updateElementValueTypes`, stale-wire
  pruning, DB signatures, Unzip schema snapshots) use `setElementsSystem` /
  `setConnectionsSystem` / `syncConnectionsAndTypes(..., 'system')`. **New
  effects that change the graph must use the system setters.**
* **MAIN** = host `graphState` (+ `formatVersion`, `revision`, `publishedAt`,
  `contentHash`; metadata only). Read-only at startup.
* **HISTORY** = host `graphHistory` / Elementor `graph_history` (newest first),
  limit `graphHistoryLimit` / `graph_history_limit` (0-10, default 5). Never
  rendered on the frontend; PRO's server lookup reads only `graphState`.
* **WORK record** = `nodelogic.graph.v2.<editorId>.work`.
* **RECOVERY** = `nodelogic.graph.v2.<editorId>.recovery.<sessionId>` (one per
  editor session).
* **BACKUPS** = `nodelogic.graph.v2.<editorId>.backups` (5 newest, deduplicated
  by content): taken before every replace of WORK and before every publish.
* **Dismissed recoveries** = `nodelogic.graph.v2.<editorId>.dismissed`.

### Semantic identity

`canonicalGraphString` (graphStore.ts) is the only definition of "same user
state": elements sorted by id, connections sorted, object keys sorted,
coordinates rounded to 1/1000 px, and derived data removed - node `valueType`,
legacy per-node `connections`, `dbSignature(Error)`, `unzipSchemaSnapshot`,
connection `id` / `valueType` / default `connectionType`, the compiled formula,
timestamps and revisions. `semanticHash` (prefixed `s1:` so a future canonical
form never compares with this one) is a fast reference for stored records;
equality decisions compare the canonical strings.

## E. Save strategy (WORK)

* Every user mutation schedules a WORK save: structural edits (add, delete,
  move, wire, undo/redo) on the next tick, other edits within 400 ms. A pending
  earlier save is never postponed, so continuous typing is stored at least
  every 400 ms. Close / tab hidden / page hide / unload flush synchronously.
* A graph the user has not touched is never written; automatic bookkeeping on
  a clean graph only moves the clean baseline (no false "unpublished changes").
* `createWorkSaveCoordinator`: each save takes a monotonic revision when it
  **starts** (seeded from the stored revision). The commit is a
  compare-and-swap against the stored stamp:
  * stored by this session with revision >= mine -> `superseded` (an older save
    finishing late never replaces a newer one);
  * stored by another session since this one last read/wrote it -> `conflict`
    (never overwritten; this tab's state goes to its recovery snapshot and the
    user can explicitly "Keep this tab's version", which backs up the other
    first);
  * otherwise write, then read back and compare (verification).
* Failures (quota, blocked storage) are shown in the status area, logged, and
  the in-memory state is written as a recovery snapshot.

## F. Undo / Redo

* One checkpoint per user operation: every mutation made by one synchronous
  handler (delete = drop wires + drop node) is one step; a wire re-drag
  (detach on mousedown, attach on mouseup) is one step; consecutive edits of
  the same field(s) within 1 s are one step (typing "Hello" is one step).
* Operations that end where they started leave no empty step.
* A new change after undo clears redo. 100 steps.
* System (derived) mutations never create steps.
* Replacing WORK (restore version / backup / recovery, import, template,
  discard) pushes a checkpoint first: Undo brings the previous working copy
  back. Publish does not touch the stacks (it does not change WORK). Loading /
  startup decisions start with empty stacks.

## G. MAIN / WORK / publish / history / restore

* Edits only change WORK. **Save Graph** = publish:
  validate (structure) -> compile (an error aborts: nothing is published) ->
  `preparePublish` (new MAIN; previous MAIN at the head of the history, then
  prune to the limit) -> local backup of the replaced MAIN -> host commits
  MAIN + HISTORY in one update (`onPublish`; Elementor reads the settings back
  to verify) -> adopt (WORK re-based on the new MAIN, status clean).
* Republishing identical content adds no history entry.
* **Limit 0** = no previous versions are stored in the page; the replaced MAIN
  is still kept as a local backup and in WordPress / Elementor revisions.
  Changing the limit is stored immediately; pruning happens only at the next
  Save Graph, inside that atomic update.
* **View** (Versions panel) is a read-only preview + diff; it cannot modify
  anything. **Restore** asks for confirmation (shows what changes, warns about
  unpublished changes), backs up the current WORK, loads the version into
  WORK (one undo step). MAIN changes only when the user then clicks Save Graph.

### Startup

```
LOAD MAIN (host) + HISTORY ──┐
LOAD WORK (validate, checksum; damaged -> quarantined) ──┼─▶ decideStartup
LOAD RECOVERY + legacy drafts ──┘         │
   no WORK / WORK == MAIN        -> open MAIN, clean
   WORK based on current MAIN    -> open WORK silently (it is the working copy)
   WORK based on another MAIN    -> ask: "continue with my working copy" or
                                    "use the page version" (the other is kept)
```

The two "based on another MAIN" cases are explained differently: Save Graph
was followed by no page update (`published-not-saved`), or the page graph
changed independently (`base-changed`).

## H. Emergency recovery

A recovery snapshot is written when the in-memory state may not be in WORK:
on page hide / unload / close **before** the final WORK flush (removed again
once WORK verifiably holds the same state), when a WORK write fails or is
refused (another tab), and every 15 s while that persists. Records carry
`snapshotId`, `editorId`, `sessionId`, `afterWorkRevision`, `createdAt`,
`baseMainHash`, `contentHash`, `checksum`, `complete`, `reason`,
`appVersion`.

`evaluateRecoveryCandidates` (read-only) offers a snapshot only if **all** hold:

1. intact: parses, right kind, supported storage version, this graph's
   `editorId`, `complete`, checksum matches, structurally valid;
2. written by another (ended) session;
3. canonical content differs from WORK **and** from MAIN;
4. not superseded: the same session did not store a later WORK revision;
5. not dismissed before (by `snapshotId`).

Timestamps never participate. After the read-only evaluation, snapshots whose
content is provably held elsewhere (equal to the verified stored WORK, or
equal to MAIN / dismissed / superseded - those copied to backups first) are
cleaned up. Corrupted / foreign / newer-format snapshots are left untouched.

The prompt explains when the snapshot was made, why it is shown, the diff
against the working copy **and** the page graph ("+1 node, moved 3 nodes,
-1 connection" with node names), a preview, and the consequences. *Restore*
replaces WORK (backup + undo; MAIN untouched); the snapshot is removed only
after WORK holds it. *Dismiss* remembers the `snapshotId`, keeps the content
as a backup and removes the snapshot.

Every decision is logged to `window.__nodelogicPersistenceLog` (last 300:
event, hashes, revisions, reason - never graph content), so "why was a
recovery offered?" can always be answered.

## I. Import / export

* **Export** (working copy, page graph, a history version or a backup): a
  versioned document `{ format: "nodelogic-graph", formatVersion: 1,
  exportedAt, appVersion, source: { kind, revision?, label? }, contentHash,
  stats, graph: { elements, connections, customNodeUi } }`. Authored content
  only: no compiled formula, no session / recovery metadata. Deterministic for
  the same content.
* **Import**: READ (size limit 10 MB) -> PARSE -> VALIDATE (format, version,
  types, unique non-empty node ids, connection endpoints, limits) -> MIGRATE
  (the editor's migrations) -> VERIFY (validated again) -> confirmation dialog
  (diff, warnings, "unpublished changes will be replaced") -> backup + undo
  checkpoint -> commit into WORK. A failed stage shows the reasons and changes
  nothing. Files of a newer format version are refused. Legacy raw graph JSON
  (no `format`) is accepted with a warning. Connections to missing nodes are
  dropped with a warning (they can never compile). A file edited after export
  imports with a warning (content hash differs).

## J. Migrations

* Stored data is never rewritten on load. MAIN keeps its old shape until the
  next Save Graph writes format 2 (`readMainMeta` treats a missing
  `formatVersion` as 1). The editor's idempotent node migrations run on every
  load path (MAIN, WORK, recovery, import, history).
* Pre-v2 drafts (`formulaEditor.autosave/save.<id>`) are read once as legacy
  recovery candidates, judged by content: identical to MAIN -> removed (after
  a backup); different -> offered (and removed only after restore / dismiss).
  They are never written again.
* Unusable stored WORK (damaged, foreign, newer format, failed migration) is
  moved to `...work.quarantine.<ts>` verbatim.

## K. Tests

* `tests/graph_store_smoke.js` (model, 118 assertions): semantic identity
  (order, keys, metadata, float noise), all 14 required recovery scenarios
  (plus dismissal, legacy drafts, ordering), startup decisions, the save race
  (A starts, B starts, B finishes, A finishes -> B stays), cross-tab conflict,
  quarantine, quota, record integrity, publish / history / retention 0-10,
  the import pipeline (each failure stage), export stability, and seeded
  property tests: invariant 1 over 100 random completion orders, invariant 4
  over 300 random graphs, every random user change detected.
* `tests/persistence_editor_smoke.js` (real built editor, 81 assertions):
  edits reach WORK only, close/reopen, publish, published-not-saved and
  base-changed conflicts, recovery prompt vs. the false-positive regression
  (identical content, newer timestamp), dismissal memory, corrupted / foreign
  snapshots, "decide later", legacy drafts, undo grouping (typing, move, delete with wires,
  redo cleared), import failures + confirmed import + undo, export format,
  host rejecting the publish, retention 0, discard, empty formula, another tab,
  a crash right after a move, and automatic bookkeeping never faking changes.
* Both suites were mutation-checked: removing the CAS ordering, the
  equal-to-WORK rule, the supersede rule, derived-field canonicalization, the
  cross-tab conflict, the close flush, the user/system split, typing
  coalescing, the empty-formula fix or the startup conflict each fails them.

## L. Implementation map

| File | Change |
| --- | --- |
| `src/components/graphEditor/graphStore.ts` | new: canonical form, hashing, diff, validation, records, startup + recovery decisions, publish planning, import/export, CAS save coordinator, storage access, log |
| `src/components/graphEditor/persistenceUi.tsx` | new: dialog frame, read-only version preview, diff list, versions panel |
| `src/components/graphEditor.tsx` | setters + undo transactions, persistence wiring, startup, publish, discard, versions, import/export, recovery and conflict dialogs, scoped shortcuts, DB-schema pruning guard |
| `src/components/graphEditor/persistence.ts` | removed the timestamp heuristic |
| `src/logic-edit.js`, `logic-block.json` | history attributes, atomic publish, close confirmation, unique ids for copied blocks |
| `src/elementor/elementor-editor.jsx`, `assets/elementor/elementor-logic.js`, `integrations.php` | history settings, verified atomic publish, real unmount on close, close confirmation |
| `style.css` | node title wraps inside the card width instead of overflowing |

## Residual limits

* WORK, recovery and backups live in this browser's localStorage. Another
  browser or device sees the page graph (MAIN) only.
* MAIN becomes durable when WordPress / Elementor saves the page; Save Graph
  stages it into the block. Forgetting to update the page is detected on the
  next open (`published-not-saved`).
* A hard crash can lose at most an in-progress typing burst (<= 400 ms).
* localStorage is ~5 MB per origin and shared with wp-admin. Failures are shown;
  backups are evicted before anything else.
* Version history increases `post_content` / `_elementor_data` by up to the
  retention limit times the graph size.
* Logic blocks inside a synced pattern (`core/block`) intentionally keep one id.
* The PRO template manager bundles its own older editor copy and is not
  affected by this change.
