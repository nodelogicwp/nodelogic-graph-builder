/* Generic Element property schema.
 *
 * When an Element Property node's Element input is only known to be an `element`
 * (e.g. an Array<element> loop item from For Each) and no concrete live preview
 * element can be resolved, the editor now offers a STATIC generic property list
 * derived from the one curated taxonomy — no runtime DOM inspection, O(1) with
 * respect to the runtime array size.
 *
 *   model  : tests/elementPropertyModel.cjs  (built by tests/run.js)
 *   editor : real dist/build/elementor.js    (property-selection UI + type flow)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const BUNDLE = fs.readFileSync(path.join(ROOT, 'dist', 'build', 'elementor.js'), 'utf8');
const MODEL = require('./elementPropertyModel.cjs');

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const mk = (id, type, data) => ({ id, name: id, type, x: 0, y: 0, data: data || {} });
const cn = (id, f, fo, t, ti) => ({ id, fromId: f, fromOutput: fo, toId: t, toInput: ti });

/* ======================================================================
 * 1. Model — the static generic schema
 * ==================================================================== */
{
  const {
    CURATED_PROPERTY_KEYS,
    GENERIC_ELEMENT_PROPERTY_KEYS,
    genericElementProperties,
    elementPropertyOrderedKeys,
    classifyPropertyType,
  } = MODEL;

  const curated = new Set(CURATED_PROPERTY_KEYS);
  ok('model: GENERIC_ELEMENT_PROPERTY_KEYS is a strict subset of CURATED_PROPERTY_KEYS',
    Array.isArray(GENERIC_ELEMENT_PROPERTY_KEYS)
    && GENERIC_ELEMENT_PROPERTY_KEYS.length > 0
    && GENERIC_ELEMENT_PROPERTY_KEYS.every((k) => curated.has(k)),
    JSON.stringify(GENERIC_ELEMENT_PROPERTY_KEYS));

  ok('model: generic list keeps canonical curated order',
    JSON.stringify(GENERIC_ELEMENT_PROPERTY_KEYS)
    === JSON.stringify(CURATED_PROPERTY_KEYS.filter((k) => GENERIC_ELEMENT_PROPERTY_KEYS.includes(k))));

  const want = ['id', 'className', 'textContent', 'title', 'value', 'name', 'type',
    'disabled', 'checked', 'placeholder', 'href', 'src'];
  ok('model: generic list contains the common cross-tag DOM properties',
    want.every((k) => GENERIC_ELEMENT_PROPERTY_KEYS.includes(k)),
    want.filter((k) => !GENERIC_ELEMENT_PROPERTY_KEYS.includes(k)).join(','));

  const speculative = ['innerHTML', 'outerHTML', 'style', 'onclick', 'dataset', 'attributes', 'classList'];
  ok('model: generic list adds no speculative / unsafe DOM members',
    speculative.every((k) => !GENERIC_ELEMENT_PROPERTY_KEYS.includes(k)),
    speculative.filter((k) => GENERIC_ELEMENT_PROPERTY_KEYS.includes(k)).join(','));

  const props = genericElementProperties();
  ok('model: genericElementProperties() returns one entry per generic key',
    props.length === GENERIC_ELEMENT_PROPERTY_KEYS.length
    && props.every((p) => p && typeof p.key === 'string' && p.source === 'dom-property'),
    JSON.stringify(props.slice(0, 2)));

  const typeOf = (k) => (props.find((p) => p.key === k) || {}).type;
  ok('model: generic property types match the curated classifier',
    typeOf('textContent') === 'string'
    && typeOf('disabled') === 'boolean'
    && typeOf('checked') === 'boolean'
    && typeOf('tabIndex') === 'number'
    && typeOf('minLength') === 'number'
    && typeOf('value') === 'string'
    && typeOf('id') === 'string',
    JSON.stringify(props));

  ok('model: entries agree with classifyPropertyType() (single source of truth)',
    props.every((p) => p.type === classifyPropertyType(p.key)));

  // O(1): no argument, stable output, independent of any array.
  ok('model: genericElementProperties takes no argument (array-size independent)',
    genericElementProperties.length === 0);
  ok('model: genericElementProperties() is a pure constant projection (stable across calls)',
    JSON.stringify(genericElementProperties()) === JSON.stringify(genericElementProperties()));

  // The mode rules are untouched: Single / Custom never consult the generic list.
  ok('model: Single mode still yields exactly the chosen key',
    JSON.stringify(elementPropertyOrderedKeys(
      { elementPropertyMode: 'single', elementProperty: 'textContent' },
      GENERIC_ELEMENT_PROPERTY_KEYS,
    )) === JSON.stringify(['textContent']));
  ok('model: Custom mode still yields exactly the selected keys (incl. non-generic)',
    JSON.stringify(elementPropertyOrderedKeys(
      { elementPropertyMode: 'custom', elementPropertySelected: [{ key: 'innerHTML', origin: 'custom' }] },
      GENERIC_ELEMENT_PROPERTY_KEYS,
    )) === JSON.stringify(['innerHTML']));
  ok('model: All mode maps to the supplied auto-detected list verbatim',
    JSON.stringify(elementPropertyOrderedKeys(
      { elementPropertyMode: 'all' },
      GENERIC_ELEMENT_PROPERTY_KEYS,
    )) === JSON.stringify([...GENERIC_ELEMENT_PROPERTY_KEYS]));
}

/* ======================================================================
 * 2. Real editor bundle — property selection UI + type flow
 * ==================================================================== */
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

async function mount(graph) {
  const w = makeWindow();
  const fcalls = [], scalls = [];
  w.mountElementorLogicEditor(w.document.getElementById('host'), {
    editorId: 'e', graphState: graph, onStateChange: (st) => scalls.push(st), onFormulaChange: (f) => fcalls.push(f),
  });
  await wait(550);
  return {
    win: w,
    state: () => scalls[scalls.length - 1],
    formula: () => fcalls[fcalls.length - 1],
    select(nodeId) {
      const card = w.document.querySelector(`[data-element-id="${nodeId}"]`);
      if (!card) return false;
      for (const t of ['mousedown', 'mouseup', 'click']) {
        card.dispatchEvent(new w.MouseEvent(t, { bubbles: true, cancelable: true }));
      }
      return true;
    },
    optionValues() {
      return Array.from(w.document.querySelectorAll('option')).map((o) => o.value).filter(Boolean);
    },
    async save() {
      const b = Array.from(w.document.querySelectorAll('button')).find((x) => /save graph/i.test(x.textContent || ''));
      if (b) b.click();
      await wait(300);
      return { formula: fcalls[fcalls.length - 1], state: scalls[scalls.length - 1] };
    },
  };
}

setTimeout(() => { console.log('HARD EXIT'); process.exit(fail ? 1 : 0); }, 120000);

(async () => {
  // Loop body ends in Collect Results so the For Each subgraph is iterated
  // (the documented value-returning consumer for For Each).
  const FE_GRAPH = (propData) => ({
    elements: [
      mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'list' }),
      mk('gc', 'get-children', { getChildrenMode: 'all', getChildrenReturnAs: 'children' }),
      mk('fe', 'array-for-each', {}),
      mk('prop', 'element-property', propData || { elementPropertyMode: 'single', elementProperty: '' }),
      mk('collect', 'array-collect', {}),
      mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
    ],
    connections: [
      cn('a', 'elref', 'output0', 'gc', 'input0'),
      cn('b', 'gc', 'output0', 'fe', 'input0'),
      cn('c', 'fe', 'output0', 'prop', 'input0'),
      cn('d', 'prop', 'output0', 'collect', 'input0'),
      cn('e', 'collect', 'output0', 'out', 'input1'),
    ],
    formula: '', updatedAt: 0,
  });

  // 2a. For Each element item -> loop item is typed `element`.
  {
    const ed = await mount(FE_GRAPH());
    const { state: st } = await ed.save();
    const fe = ((st || {}).elements || []).find((e) => e.id === 'fe');
    ok('editor: For Each over Get Children Array<element> -> loop item valueType "element"',
      fe && fe.valueType === 'element' && fe.data && fe.data.arrayItemType === 'element',
      JSON.stringify(fe && { valueType: fe.valueType, data: fe.data }));
  }

  // 2b. Element Property fed by that loop item shows the generic list WITHOUT
  //     a live preview element and WITHOUT switching to Custom.
  {
    const ed = await mount(FE_GRAPH());
    ok('editor: Element Property node selectable', ed.select('prop'));
    await wait(250);
    const opts = ed.optionValues();
    ok('editor: generic property list offered for a For Each element item (Single mode)',
      opts.includes('textContent') && opts.includes('id') && opts.includes('className'),
      JSON.stringify(opts));
    ok('editor: generic list is the model list (no speculative extras in the UI)',
      MODEL.GENERIC_ELEMENT_PROPERTY_KEYS.every((k) => opts.includes(k))
      && !opts.includes('innerHTML') && !opts.includes('style'),
      JSON.stringify(opts));
  }

  // 2c. Runtime still reads the requested property directly per item, inside the
  //     iterated loop body (Collect Results).
  {
    const ed = await mount(FE_GRAPH({ elementPropertyMode: 'single', elementProperty: 'textContent' }));
    const { formula } = await ed.save();
    ok('editor: For Each + generic "textContent" -> formula reads the property per element',
      typeof formula === 'string'
      && /__nodeGetElementProp\(__nodeLoopItem,\s*\\?"textContent\\?"\)/.test(formula),
      JSON.stringify(formula));
    ok('editor: For Each property read is iterated (loop-body graph), not read once',
      typeof formula === 'string'
      && /__nodeArray(Map|Filter|Collect)Graph\(/.test(formula)
      && !/__nodeGetElementProp\(__nodeArrayForEach\(/.test(formula),
      JSON.stringify(formula));
  }
  {
    const ed = await mount(FE_GRAPH({ elementPropertyMode: 'single', elementProperty: 'id' }));
    const { formula } = await ed.save();
    ok('editor: For Each + generic "id" -> formula reads "id" per element',
      typeof formula === 'string'
      && /__nodeGetElementProp\(__nodeLoopItem,\s*\\?"id\\?"\)/.test(formula),
      JSON.stringify(formula));
  }

  // 2d. Custom / unknown property path unchanged.
  {
    const ed = await mount(FE_GRAPH({
      elementPropertyMode: 'custom',
      elementPropertySelected: [{ key: 'innerHTML', origin: 'custom' }],
    }));
    const { formula } = await ed.save();
    ok('editor: Custom property "innerHTML" still compiles verbatim',
      typeof formula === 'string' && /innerHTML/.test(formula)
      && /__nodeGetElementProp\(__nodeLoopItem,\s*\\?"innerHTML\\?"\)/.test(formula),
      JSON.stringify(formula));
  }

  // 2e. Direct Element -> Element Property (single) still works (no regression).
  {
    const g = {
      elements: [
        mk('elref', 'element-ref', { elementUseManualId: true, customElementId: 'text-1' }),
        mk('prop', 'element-property', { elementPropertyMode: 'single', elementProperty: 'textContent' }),
        mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
      ],
      connections: [
        cn('a', 'elref', 'output0', 'prop', 'input0'),
        cn('b', 'prop', 'output0', 'out', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const ed = await mount(g);
    const { formula } = await ed.save();
    ok('editor: direct element-ref -> Element Property still reads the property',
      typeof formula === 'string'
      && /__nodeGetElementProp\(__nodeGetElement\("text-1"\),\s*"textContent"\)/.test(formula),
      JSON.stringify(formula));
  }

  // 2f. Primitive For Each is unaffected — loop item stays `number`, no generic
  //     element list leaks into a primitive pipeline.
  {
    const g = {
      elements: [
        mk('seed', 'array', { arrayItemType: 'number' }),
        mk('n', 'number', { value: 7 }),
        mk('push', 'array-push', {}),
        mk('fe', 'array-for-each', {}),
        mk('out', 'output', { outputTargetElementPin: true, selectedElement: 'sink' }),
      ],
      connections: [
        cn('a', 'seed', 'output0', 'push', 'input0'),
        cn('b', 'n', 'output0', 'push', 'input1'),
        cn('c', 'push', 'output0', 'fe', 'input0'),
        cn('d', 'fe', 'output0', 'out', 'input1'),
      ],
      formula: '', updatedAt: 0,
    };
    const ed = await mount(g);
    const { state: st } = await ed.save();
    const fe = ((st || {}).elements || []).find((e) => e.id === 'fe');
    ok('editor: primitive Array<number> -> For Each loop item stays "number"',
      fe && fe.valueType === 'number' && (fe.data || {}).arrayItemType === 'number',
      JSON.stringify(fe && { valueType: fe.valueType, data: fe.data }));
  }

  // 2g. Persistence: nothing about the generic schema is serialised; no DOM node.
  {
    const ed = await mount(FE_GRAPH({ elementPropertyMode: 'single', elementProperty: 'textContent' }));
    const { state } = await ed.save();
    const json = JSON.stringify(state || {});
    ok('editor: saved graph has no serialized DOM node / detection cache',
      json.length > 0
      && !/"nodeType"\s*:\s*1/.test(json)
      && !/"tagName"/.test(json)
      && !/\[object HTML/.test(json)
      && !/elementPropertyDetection/i.test(json),
      'suspicious saved graph');
    ok('editor: For Each item type persists as the plain string "element"',
      /"arrayItemType":"element"/.test(json.replace(/\s/g, '')), json.slice(0, 200));
    ok('editor: Element Property node persists only its mode + chosen key',
      (() => {
        const p = (state.elements || []).find((e) => e.id === 'prop');
        return p && p.data && p.data.elementPropertyMode === 'single'
          && p.data.elementProperty === 'textContent'
          && !('elementPropertySelected' in p.data && p.data.elementPropertySelected.length);
      })(),
      JSON.stringify((state.elements || []).find((e) => e.id === 'prop')));
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
