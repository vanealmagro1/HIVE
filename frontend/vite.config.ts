/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { hiveRelay } from './vite/hiveRelay';

// Catálogo de beacons compartido con el escáner Python y el lector del celular.
const BEACON_CATALOG = fileURLToPath(new URL('../beacons/beacons.json', import.meta.url));

export default defineConfig({
  plugins: [react(), hiveRelay(BEACON_CATALOG)],
  // El bundle 3D (three.js) se carga bajo demanda; su tamaño es esperado para una demo local.
  build: {
    chunkSizeWarningLimit: 1200,
    // Dos páginas: la app (proyector) y el lector de mano del celular.
    rollupOptions: { input: { main: fileURLToPath(new URL('index.html', import.meta.url)), lector: fileURLToPath(new URL('lector.html', import.meta.url)) } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
