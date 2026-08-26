import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            input: {
                elementor: 'src/elementor/elementor-editor.jsx',
            },
            output: {
                entryFileNames: 'build/[name].js',
            }
        }
    }
});
