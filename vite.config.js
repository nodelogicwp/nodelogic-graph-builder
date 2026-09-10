import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Elementor editor bundle is enqueued as a classic <script> in the Elementor
// editor's top window (alongside Elementor + the @wordpress/* packages). Without
// an explicit wrapper Rollup emits bare top-level `var`/`function` declarations,
// which then leak onto `window` (the whole bundled React included). Force an IIFE
// so the bundle keeps a private scope; its only intentional global remains
// `window.mountElementorLogicEditor`, assigned from inside elementor-editor.jsx.
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                elementor: 'src/elementor/elementor-editor.jsx',
            },
            output: {
                format: 'iife',
                name: 'NodeLogicElementorEditor',
                entryFileNames: 'build/[name].js',
                inlineDynamicImports: true,
            },
        },
    },
});
