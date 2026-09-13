# Regression smoke tests

Node + jsdom scripts that exercise the real `frontend.js` runtime and the real
built editor bundle (`dist/build/elementor.js`). No test framework — each
`*_smoke.js` prints `N passed, M failed` and exits non‑zero on failure.

```
npm test              # run every suite   (tests/run.js)
npm run test editor   # run suites matching "editor"
npm run typecheck     # tsc gate (model files clean; graphEditor.tsx <= baseline)
npm run verify        # check:frontend + typecheck + build:all + test
```

`tests/run.js` first builds the pure model modules to CJS (`*.cjs`, git‑ignored)
via the esbuild JS API, then runs the suites with `NODE_PATH` pointed at the
project `node_modules` (jsdom is a transitive dependency of `@wordpress/scripts`).

The `real_editor_*` suites need `dist/build/elementor.js` up to date — run
`npm run build:elementor` first if you changed `src/`.

## What each suite covers

| Suite | Area |
| --- | --- |
| `audit2_frontend_smoke` | formula-eval cache freshness, `[N]` var collision, api-request guard |
| `boolmath_nodes_smoke` | NOT/AND/OR/Clamp/Min/Max/Includes/Count-Chars formula → runtime |
| `chart_api_event_smoke` | `renderChartBlock` (malformed/empty/huge), api nodes (2xx/4xx/5xx/empty/bad JSON), event listener leak |
| `child_pin_mapping_smoke` | Get Children pin → child-index mapping (detection-independent) |
| `editor_chrome_filter_smoke` | Elementor editor-only chrome filtered from child enumeration |
| `event_repeat_execution_smoke` | event node "stops after first execution" release blocker: 3+ consecutive occurrences of the same event keep firing (setText, toggleClass), no duplicate Action→Event listeners, no spurious re-fire on unrelated recalcs, branch-flip listener cleanup/reinit, multiple event nodes don't interfere, action-plan-key whitelist gap — real rAF-debounced pipeline |
| `hex_base_conversion_smoke` | `number-to-base` / `number-parse` release blocker: compiler had no `case` for either type and fell through to identity passthrough (255 stayed "255"); literal + formula-generated values now actually convert via `__nodeToBase` / `__nodeParseRadix` across radix 2/8/10/16, zero-pad `minLength`, and non-numeric input |
| `get_element_property_freshness_smoke` | stale Get Element Property release blocker: Get→Add1→Set executed 3x reads the DOM as mutated by the previous execution (not frozen on the first read); a __nodeGetElementProp-bearing formula is never persisted in formulaEvaluationCache; unrelated/non-property formulas still cache normally; two reads within one execution agree; independent blocks don't interfere |
| `output_same_target_collision_smoke` | two Output nodes targeting the same element (selectedElement dropdown, not wired via Element pin) release blocker: compiler no longer emits a duplicate object-literal key that silently drops one Output's entire payload; init + 3 consecutive event executions read the value the previous execution wrote; single-Output-per-target unaffected; pre-fix (bare target-id key) formulas still resolve via the entryKey fallback |
| `element_input_pin_smoke` | Element input pin architecture (Get Element Property / Get Children / image-from-element / Action Event Node): connected pin wins, own Element ID control (added where missing) is the fallback, both resolve live via __nodeGetElement; the ACTUAL root cause of "still failing" after the key-collision fix (Get Element Property had no ID-control fallback at all -- unwired input0 compiled to a constant null, never the DOM); Reference-type nodes get no pin; existing Output Element-pin behavior unchanged |
| `element_property_generic_smoke` | generic Element property schema: static list offered for a For Each `element` loop item with no live preview, subset of the curated taxonomy, O(1); Single/Custom/primitive paths unchanged |
| `pointer_isolation_smoke` | wheel / mousedown inside a node's `.nl-scroll-guard` list does not zoom the canvas or start a node drag; bare-canvas wheel-zoom and node-header drag still work |
| `foreach_repro_smoke` | exact reported bug: Get Children → For Each → Output → Set Text iterates per child |
| `foreach_execution_smoke` | For Each: multi / single / empty / per-item-no-leak / Collect still works / nested / non-array |
| `api_async_smoke` | API system: `__nodeApiRequest` used a synchronous XHR (main-thread-blocking) -- fixed to real async (fire-and-cache, `scheduleRecalculation()` on response, same pattern as `__nodeEvent`); found and fixed a `formulaEvaluationCache` staleness bug in the same family as the already-fixed `__nodeGetElementProp` one (a formula calling the async API is now never persisted in that cache, so the response's arrival is never frozen out); PRO expansion verified: Body pin, Headers/Timeout fields, PUT/PATCH/DELETE, string-vs-object body encoding (was double-JSON-encoding a pre-built JSON string), the new `api-status` node (status/ok/error, independent of `api-request`'s unchanged success-body contract), and concurrent identical requests deduped to one network call |
| `array_element_smoke` | Array&lt;Element&gt; matrix A–P: push/get/contains/find/merge/unique/map/filter/collect/forEach with live DOM nodes, connection+type compat, persistence never serialises a DOM node |
| `css_gradient_event_smoke` | CSS folder / gradient / event-processor formula → runtime (restored regression) |
| `memory_system_smoke` | Memory system: `memory-read-*`/`memory-write-*` had no compiler case (same bug class as hex, and reachable today via PRO's palette) -- fixed; `window.memoryStore` had zero per-widget scoping (same collision class as the already-fixed `nodelogicActionBindings`) -- fixed via `__nodeMemoryResolveKey`/blockScope, default `'widget'` scope with an opt-in `'page'` scope for intentional sharing, verified with 3 duplicated-widget logic blocks; new `memory-has`/`memory-delete`/`memory-increment`/`memory-array-append`/`memory-array-remove`, the mutating ones gated by the existing eventKey/triggeredCount idiom so they don't fire on every unrelated recalculation |
| `migration_fuzz_smoke` | model migrations vs null/garbage/legacy/partial data |
| `node_family_runtime_smoke` | calculation / condition / string / css / color / array / switch families |
| `output_element_e2e_smoke` | Get Children → Output.Element → Set Text / Value → real DOM |
| `prune_modeswitch_smoke` | dynamic output-pin pruning on mode switch / headless save |
| `real_editor_child_smoke` | real bundle: Save → captured formula → real frontend eval |
| `real_editor_malformed_smoke` | real bundle mounts + saves on corrupted / legacy graph state |
| `real_editor_mutation_smoke` | real bundle: delete a wired node, no crash, formula regenerates |
| `structural_wrapper_smoke` | `.elementor-widget-container` / `.e-con-inner` transparency |
