import { defineConfig } from 'vite';

export default defineConfig({ build: { target: 'esnext' }, esbuild: { target: 'esnext' }, server: { host: true } });
