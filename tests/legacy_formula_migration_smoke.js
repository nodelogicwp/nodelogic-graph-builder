const fs = require('fs');

const source = fs.readFileSync('frontend.js', 'utf8');
const start = source.indexOf('  function repairLegacyLoopBodyEncoding(expression) {');
const end = source.indexOf('  function createFormulaEvalContext', start);
const match = start >= 0 && end > start ? [source.slice(start, end)] : null;
if (!match) throw new Error('legacy migration helper not found');
const helperSource = match[0];
const decodeFormulaEscape = (char) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', '"': '"', "'": "'", '\\': '\\' }[char] ?? char);
const repairLegacyLoopBodyEncoding = Function('decodeFormulaEscape', `return (${helperSource.trim()})`)(decodeFormulaEscape);

const legacyBody = '({ "__element": __nodeLoopMultiItemAt(1), "__executeOnLoad": true, actions: [({ type: "eventGate", "trigger": __nodeArrayEventAggregate(__nodeGetChildren(__nodeLoopItem), __nodeEvent(__nodeLoopItem, "click")) })] })';
const legacyFormula = `({ "nlOutEl:test": __nodeArrayMultiMapGraph([[], []], ${JSON.stringify(legacyBody)}) })`;
const repaired = repairLegacyLoopBodyEncoding(legacyFormula);

if (!repaired.includes('__nodeFormulaBody([')) throw new Error('legacy body was not migrated');
if (repaired.includes(JSON.stringify(legacyBody))) throw new Error('legacy quoted body remains');
const clickCodes = Array.from('"click"').map((char) => char.charCodeAt(0)).join(',');
if (!repaired.includes(clickCodes)) throw new Error('body contents were corrupted');

const legacyRawHtml = '__nodeRawHtml("node-id", "<div class="nl-card">\\n<h3></h3>\\n</div>", [], [])';
const repairedRawHtml = repairLegacyLoopBodyEncoding(legacyRawHtml);
if (!repairedRawHtml.includes('__nodeFormulaBody([')) throw new Error('legacy Raw HTML was not migrated');
console.log('legacy nested formula migration passed');
