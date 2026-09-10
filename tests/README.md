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
| `element_property_generic_smoke` | generic Element property schema: static list offered for a For Each `element` loop item with no live preview, subset of the curated taxonomy, O(1); Single/Custom/primitive paths unchanged |
| `pointer_isolation_smoke` | wheel / mousedown inside a node's `.nl-scroll-guard` list does not zoom the canvas or start a node drag; bare-canvas wheel-zoom and node-header drag still work |
| `foreach_repro_smoke` | exact reported bug: Get Children → For Each → Output → Set Text iterates per child |
| `foreach_execution_smoke` | For Each: multi / single / empty / per-item-no-leak / Collect still works / nested / non-array |
| `array_element_smoke` | Array&lt;Element&gt; matrix A–P: push/get/contains/find/merge/unique/map/filter/collect/forEach with live DOM nodes, connection+type compat, persistence never serialises a DOM node |
| `css_gradient_event_smoke` | CSS folder / gradient / event-processor formula → runtime (restored regression) |
| `migration_fuzz_smoke` | model migrations vs null/garbage/legacy/partial data |
| `node_family_runtime_smoke` | calculation / condition / string / css / color / array / switch families |
| `output_element_e2e_smoke` | Get Children → Output.Element → Set Text / Value → real DOM |
| `prune_modeswitch_smoke` | dynamic output-pin pruning on mode switch / headless save |
| `real_editor_child_smoke` | real bundle: Save → captured formula → real frontend eval |
| `real_editor_malformed_smoke` | real bundle mounts + saves on corrupted / legacy graph state |
| `real_editor_mutation_smoke` | real bundle: delete a wired node, no crash, formula regenerates |
| `structural_wrapper_smoke` | `.elementor-widget-container` / `.e-con-inner` transparency |
