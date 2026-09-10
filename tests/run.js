#!/usr/bin/env node
/*
 * Regression smoke-test runner for NodeLogic Graph Builder.
 *
 *   node tests/run.js            # run every *_smoke.js suite
 *   node tests/run.js editor     # run suites whose name matches "editor"
 *
 * Each suite is a standalone script that prints "N passed, M failed" and exits
 * non-zero on failure. Suites use jsdom (a transitive dep of @wordpress/scripts)
 * and, for the editor-bundle suites, the built dist/build/elementor.js — run
 * `npm run build:elementor` (or `npx vite build`) first if that file is stale.
 *
 * This runner also (re)builds the pure model modules to CJS so the model suites
 * can require them without a bundler.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NODE = process.execPath;
const filter = process.argv[2] || '';

// 1. Build the pure-model CJS shims the model suites require (via the esbuild
//    JS API — the .bin/.cmd shim is unreliable through execFileSync on Windows).
const esbuild = require(path.join(ROOT, 'node_modules', 'esbuild'));
const models = ['getChildrenModel', 'elementPropertyModel', 'previewResolver'];
for (const m of models) {
    const src = path.join(ROOT, 'src', 'components', 'graphEditor', `${m}.ts`);
    const out = path.join(__dirname, `${m}.cjs`);
    if (!fs.existsSync(src)) continue;
    try {
        esbuild.buildSync({ entryPoints: [src], bundle: true, format: 'cjs', platform: 'node', outfile: out });
    } catch (e) {
        console.error(`! could not build ${m}.cjs — model suites may fail:`, e.message);
    }
}

// 2. Discover and run suites.
const suites = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('_smoke.js'))
    .filter((f) => !filter || f.includes(filter))
    .sort();

let totalPass = 0;
let totalFail = 0;
const failed = [];

for (const suite of suites) {
    process.stdout.write(`\n── ${suite} ──\n`);
    let out = '';
    let code = 0;
    try {
        out = execFileSync(NODE, [path.join(__dirname, suite)], {
            env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
            encoding: 'utf8',
            timeout: 5 * 60 * 1000,
        });
    } catch (e) {
        out = `${e.stdout || ''}${e.stderr || ''}`;
        code = e.status || 1;
    }
    const m = out.match(/(\d+) passed, (\d+) failed/);
    if (m) {
        totalPass += Number(m[1]);
        totalFail += Number(m[2]);
        console.log(`   ${m[1]} passed, ${m[2]} failed`);
        // surface individual FAIL lines
        out.split('\n').filter((l) => /^FAIL\s/.test(l)).forEach((l) => console.log('   ' + l));
    } else {
        console.log('   (no result line — suite errored)');
        console.log(out.split('\n').slice(-15).map((l) => '   ' + l).join('\n'));
    }
    if (code !== 0 || (m && Number(m[2]) > 0)) failed.push(suite);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`TOTAL: ${totalPass} passed, ${totalFail} failed  (${suites.length} suites)`);
if (failed.length) {
    console.log(`FAILED SUITES: ${failed.join(', ')}`);
    process.exit(1);
}
console.log('All regression suites passed.');
