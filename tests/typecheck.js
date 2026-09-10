#!/usr/bin/env node
/*
 * Type-check the editor sources. The project's tsconfig.json uses
 * `moduleResolution: "node"`, which the installed TypeScript rejects, so this
 * invokes tsc with an explicit, self-contained flag set instead. It is not a
 * substitute for tsconfig; it is a regression gate.
 *
 * A baseline of pre-existing errors in graphEditor.tsx is tolerated (documented
 * in the audit notes); the check fails only if the count rises above BASELINE.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Invoke the tsc entry script through node directly — the .bin/.cmd shim does
// not reliably forward stdout/exit status via execFileSync on Windows.
const tscJs = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

const FLAGS = [
    '--ignoreConfig', '--noEmit', '--strict', '--jsx', 'react',
    '--lib', 'dom,dom.iterable,es2020', '--module', 'esnext',
    '--moduleResolution', 'bundler', '--target', 'es2019',
    '--skipLibCheck', '--esModuleInterop', '--resolveJsonModule', '--allowJs',
];

const CLEAN = [
    'src/components/graphEditor/previewResolver.ts',
    'src/components/graphEditor/getChildrenModel.ts',
    'src/components/graphEditor/elementPropertyModel.ts',
    'src/components/graphEditor/persistence.ts',
];
// graphEditor.tsx carries a documented baseline of pre-existing errors.
const BASELINE = 17;

function tscErrors(files) {
    try {
        execFileSync(process.execPath, [tscJs, ...FLAGS, ...files], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
        return [];
    } catch (e) {
        const out = `${e.stdout || ''}${e.stderr || ''}`;
        return out.split('\n').filter((l) => /error TS\d+/.test(l));
    }
}

let ok = true;

const cleanErrs = tscErrors(CLEAN);
if (cleanErrs.length) {
    ok = false;
    console.log(`FAIL  model files must be error-free — found ${cleanErrs.length}:`);
    cleanErrs.forEach((l) => console.log('  ' + l));
} else {
    console.log(`PASS  model files type-check clean (${CLEAN.length} files)`);
}

const geErrs = tscErrors(['src/components/graphEditor.tsx']);
if (geErrs.length > BASELINE) {
    ok = false;
    console.log(`FAIL  graphEditor.tsx: ${geErrs.length} errors > baseline ${BASELINE} — a regression was introduced:`);
    geErrs.forEach((l) => console.log('  ' + l));
} else {
    console.log(`PASS  graphEditor.tsx: ${geErrs.length} errors (<= documented baseline ${BASELINE})`);
}

process.exit(ok ? 0 : 1);
