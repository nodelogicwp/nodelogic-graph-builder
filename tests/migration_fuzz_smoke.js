/* Feed the pure model migrations garbage / legacy / partial data and verify
 * they never throw and always yield a well-formed node. */
const GC = require('./getChildrenModel.cjs');
const EP = require('./elementPropertyModel.cjs');

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };
const noThrow = (l, fn) => { try { const r = fn(); ok(l, true); return r; } catch (e) { ok(l, false, 'threw ' + e.message); return undefined; } };

const garbage = [
  null, undefined, 0, '', 'str', [], {}, { type: 'get-children' }, { type: 'element-property' },
  { type: 'get-children', data: null }, { type: 'get-children', data: 'x' }, { type: 'get-children', data: [] },
  { type: 'get-children', data: { getChildrenMode: 'nonsense', getChildrenReturnAs: 42 } },
  { type: 'get-children', data: { getChildrenMode: 'custom', getChildrenSelected: 'not-array' } },
  { type: 'get-children', data: { getChildrenMode: 'custom', getChildrenSelected: [1, -3, 'x', null, 2.7, NaN, Infinity] } },
  { type: 'get-children', data: { getChildrenSingleIndex: -5 } },
  { type: 'get-children', data: { getChildrenSingleIndex: 'abc' } },
  { type: 'element-property', data: { elementPropertyMode: 'bogus' } },
  { type: 'element-property', data: { elementPropertySelected: 'nope' } },
  { type: 'element-property', data: { elementPropertySelected: [null, { }, { key: '' }, { key: '  ' }, { key: 'value' }, 42] } },
  { type: 'number', data: {} }, // wrong type — must pass through untouched
  { type: 'output', data: {} },
];

for (let i = 0; i < garbage.length; i++) {
  const g = garbage[i];
  noThrow(`GC migrate #${i} (${String(JSON.stringify(g)).slice(0, 60)})`, () => GC.migrateGetChildrenNodeData(g));
  noThrow(`EP migrate #${i}`, () => EP.migrateElementPropertyNodeData(g));
}

// Semantic checks
{
  const m = GC.migrateGetChildrenNodeData({ type: 'get-children', data: {} });
  ok('GC: legacy {} -> all/children', m.data.getChildrenMode === 'all' && m.data.getChildrenReturnAs === 'children', JSON.stringify(m.data));
  const m2 = GC.migrateGetChildrenNodeData(m);
  ok('GC: idempotent (same ref second run)', m2 === m);
  const num = { type: 'number', data: { value: 5 } };
  ok('GC: non-get-children returned untouched (same ref)', GC.migrateGetChildrenNodeData(num) === num);

  const e = EP.migrateElementPropertyNodeData({ type: 'element-property', data: { elementProperty: 'value' } });
  ok('EP: legacy -> single mode, keeps elementProperty', e.data.elementPropertyMode === 'single' && e.data.elementProperty === 'value', JSON.stringify(e.data));
  ok('EP: idempotent', EP.migrateElementPropertyNodeData(e) === e);
}

// getChildren helpers with garbage
{
  noThrow('getChildrenPinChildIndex(garbage)', () => {
    GC.getChildrenPinChildIndex(null, 0);
    GC.getChildrenPinChildIndex({ getChildrenMode: 'custom', getChildrenReturnAs: 'child', getChildrenSelected: [3, 1] }, 99);
    GC.getChildrenPinChildIndex({ getChildrenMode: 'all', getChildrenReturnAs: 'child' }, -1);
    GC.getChildrenPinChildIndex({ getChildrenMode: 'single', getChildrenSingleIndex: 'x' }, 0);
  });
  ok('getChildrenPinChildIndex all+child(-1) -> null (bad pin)', GC.getChildrenPinChildIndex({ getChildrenMode: 'all', getChildrenReturnAs: 'child' }, -1) === null);
  ok('getChildrenPinChildIndex custom past end -> null', GC.getChildrenPinChildIndex({ getChildrenMode: 'custom', getChildrenReturnAs: 'child', getChildrenSelected: [3] }, 5) === null);
  ok('getChildrenOutputCount(garbage detected) -> finite >=0', (() => { const n = GC.getChildrenOutputCount({ getChildrenMode: 'all', getChildrenReturnAs: 'child' }, NaN); return Number.isFinite(n) && n >= 0; })());
  ok('getChildrenOrderedIndices(garbage) -> array', Array.isArray(GC.getChildrenOrderedIndices({ getChildrenMode: 'custom', getChildrenReturnAs: 'child', getChildrenSelected: [1, 'x', -2, 3] }, 10)));
}

// elementProperty helpers with garbage
{
  noThrow('elementPropertyOrderedKeys(garbage)', () => {
    EP.elementPropertyOrderedKeys(null, []);
    EP.elementPropertyOrderedKeys({ elementPropertyMode: 'custom', elementPropertySelected: [null, { key: 5 }, { key: 'a' }] }, []);
    EP.elementPropertyOrderedKeys({ elementPropertyMode: 'all' }, ['x', 'y']);
  });
  ok('elementPropertyOutputCount(all, keys) = keys.length', EP.elementPropertyOutputCount({ elementPropertyMode: 'all' }, ['a', 'b', 'c']) === 3);
  ok('elementPropertyOutputCount(single) = 1', EP.elementPropertyOutputCount({ elementPropertyMode: 'single' }, []) === 1);
  ok('classifyPropertyType(unknown key) -> string', EP.classifyPropertyType('totally-made-up-key') === 'string');
  ok('classifyPropertyType("checked") -> boolean', EP.classifyPropertyType('checked') === 'boolean');
  ok('classifyPropertyType("value", numericValueControl) -> number', EP.classifyPropertyType('value', { numericValueControl: true }) === 'number');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
