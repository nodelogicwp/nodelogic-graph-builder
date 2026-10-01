/* Static guard against "Cannot access 'X' before initialization" crashes in
 * the graph editor (twice seen live: DB Fields -> Select, Unzip of a DB
 * Select). The editor component declares hundreds of `const` helpers; a
 * useMemo callback runs DURING render, at its own statement, so everything it
 * (transitively) calls must already be declared above it. jsdom smoke tests
 * only hit such paths for the exact graph shapes they build; this scans them
 * all.
 *
 * Method: parse graphEditor.tsx, take the component's top-level `const`
 * declarations, start from every `useMemo(...)` initializer, follow
 * references into arrow/function initializers transitively, and report any
 * reached declaration that sits BELOW the memo.
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const FILE = path.resolve(__dirname, '..', 'src', 'components', 'graphEditor.tsx');
let pass = 0, fail = 0;
const ok = (l, c, d) => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : `\n${d}`}`); };

const ast = parse(fs.readFileSync(FILE, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });

const children = (node) => {
  const out = [];
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments' || key === 'extra') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((v) => v && typeof v.type === 'string' && out.push(v));
    else if (value && typeof value.type === 'string') out.push(value);
  }
  return out;
};
const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression' || n.type === 'FunctionDeclaration');

// The editor component = the function with the most top-level statements.
let component = null;
(function find(node) {
  if (isFn(node) && node.body && node.body.type === 'BlockStatement' && (!component || node.body.body.length > component.body.body.length)) component = node;
  children(node).forEach(find);
})(ast.program);

const decls = new Map(); // name -> { line, init }
const addPattern = (pattern, info) => {
  if (!pattern) return;
  if (pattern.type === 'Identifier') decls.set(pattern.name, info);
  else if (pattern.type === 'ArrayPattern') pattern.elements.forEach((e) => addPattern(e, { ...info, init: null }));
  else if (pattern.type === 'ObjectPattern') pattern.properties.forEach((p) => addPattern(p.value || p.argument, { ...info, init: null }));
};
component.body.body.forEach((st) => {
  if (st.type === 'VariableDeclaration') st.declarations.forEach((d) => addPattern(d.id, { line: d.loc.start.line, init: d.init }));
  if (st.type === 'FunctionDeclaration' && st.id) decls.set(st.id.name, { line: st.loc.start.line, init: null, hoisted: true });
});

const refsIn = (root) => {
  const out = new Set();
  (function walk(node, parent) {
    if (node.type === 'Identifier' && decls.has(node.name)) {
      const isMemberName = parent && (parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === node && !parent.computed;
      const isKey = parent && (parent.type === 'ObjectProperty' || parent.type === 'ObjectMethod') && parent.key === node && !parent.computed && !parent.shorthand;
      if (!isMemberName && !isKey) out.add(node.name);
    }
    children(node).forEach((c) => walk(c, node));
  })(root, null);
  return out;
};
// Evaluated during render at its own statement: every initializer that is not
// itself a function -- useMemo callbacks, plain expressions, useState
// initializers -- except useCallback, whose callback only runs later.
const calleeName = (init) => (init.callee.type === 'MemberExpression' ? `${init.callee.object.name}.${init.callee.property.name}` : init.callee.name || '');
const isImmediate = (init) => {
  if (!init || isFn(init)) return false;
  if (init.type === 'CallExpression' && /(^|\.)useCallback$/.test(calleeName(init))) return false;
  return true;
};

const problems = [];
let roots = 0;
for (const [name, d] of decls) {
  if (!isImmediate(d.init)) continue;
  roots++;
  const seen = new Set();
  const stack = [...refsIn(d.init)].map((ref) => [ref, []]);
  while (stack.length) {
    const [ref, trail] = stack.pop();
    if (seen.has(ref) || ref === name) continue;
    seen.add(ref);
    const target = decls.get(ref);
    if (!target.hoisted && target.line > d.line) {
      problems.push(`  ${name} (render-time, line ${d.line}) -> ${[...trail, ref].join(' -> ')}  [declared at line ${target.line}]`);
    }
    if (isFn(target.init)) refsIn(target.init).forEach((r) => stack.push([r, [...trail, ref]]));
  }
}

ok(`found the editor component and its render-time initializers (${decls.size} declarations, ${roots} roots)`, decls.size > 200 && roots > 3, `${decls.size} / ${roots}`);
ok('no render-time initializer reaches a helper declared below it (render-time TDZ)', problems.length === 0, problems.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
