/* Get Children "Child" return-as: pin -> child-index mapping must NOT depend on
 * live preview detection (the bug: detectedCount 0 -> formula emitted `null`). */
const GC = require('./getChildrenModel.cjs');

let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `  (${d})`}`); };

const P = GC.getChildrenPinChildIndex;

/* --- all + child: identity, independent of detection ---------------------- */
const allChild = { getChildrenMode: 'all', getChildrenReturnAs: 'child' };
ok('all+child pin 0 -> child 0', P(allChild, 0) === 0);
ok('all+child pin 3 -> child 3', P(allChild, 3) === 3);
ok('all+child pin 0 -> child 0 (detection irrelevant / not passed)', P(allChild, 0) === 0);

/* --- single: fixed index ------------------------------------------------- */
ok('single -> its single index', P({ getChildrenMode: 'single', getChildrenSingleIndex: 2 }, 0) === 2);
ok('single pin 5 still -> single index', P({ getChildrenMode: 'single', getChildrenSingleIndex: 2 }, 5) === 2);

/* --- custom + child: k-th persisted selection -------------------------- */
const customChild = { getChildrenMode: 'custom', getChildrenReturnAs: 'child', getChildrenSelected: [3, 1, 4] };
ok('custom+child pin 0 -> 3', P(customChild, 0) === 3);
ok('custom+child pin 1 -> 1', P(customChild, 1) === 1);
ok('custom+child pin 2 -> 4', P(customChild, 2) === 4);
ok('custom+child pin 3 (past selection) -> null', P(customChild, 3) === null);

/* --- children (array) modes: no per-pin mapping ------------------------ */
ok('all+children -> null', P({ getChildrenMode: 'all', getChildrenReturnAs: 'children' }, 0) === null);
ok('custom+children -> null', P({ getChildrenMode: 'custom', getChildrenReturnAs: 'children', getChildrenSelected: [1] }, 0) === null);

/* --- defaults / junk -------------------------------------------------- */
ok('no data -> children default -> null', P(undefined, 0) === null);
ok('negative pin -> null', P(allChild, -1) === null);

/* --- the exact formula-gen decision, before vs after ----------------- */
// BEFORE: childIndex = getChildrenOrderedIndices(data, detectedCount)[pin]
//   with detectedCount 0 -> [] -> undefined -> formula literal "null"
const beforeBad = GC.getChildrenOrderedIndices(allChild, 0)[0];
ok('OLD path: detectedCount 0 yields undefined (=> formula "null")', beforeBad === undefined);
// AFTER: detection-independent
const afterGood = GC.getChildrenPinChildIndex(allChild, 0);
ok('NEW path: detectedCount irrelevant -> child index 0', afterGood === 0);

// simulate formula string both ways
const genOld = (data, pin, detectedCount) => {
  const ci = GC.getChildrenOrderedIndices(data, detectedCount)[pin];
  return ci === undefined ? 'null' : `__nodeGetChildAt(REF, ${ci})`;
};
const genNew = (data, pin) => {
  const ci = GC.getChildrenPinChildIndex(data, pin);
  return ci === null ? 'null' : `__nodeGetChildAt(REF, ${ci})`;
};
ok('OLD formula w/ empty detection == "null" (the frontend bug)', genOld(allChild, 0, 0) === 'null');
ok('NEW formula w/ empty detection == __nodeGetChildAt(REF, 0)', genNew(allChild, 0) === '__nodeGetChildAt(REF, 0)');
ok('NEW formula matches OLD when detection WAS present', genNew(allChild, 2) === genOld(allChild, 2, 5));
ok('NEW custom formula == OLD custom formula', genNew(customChild, 1) === genOld(customChild, 1, 9));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
