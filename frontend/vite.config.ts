import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // 5176/5177 supaya bisa jalan bersamaan dengan Digital Twin Jembatan (5174/5175).
    port: 5176,
    strictPort: true,
    // host: true agar server dev juga mendengarkan di alamat IP LAN,
    // sehingga perangkat lain di jaringan yang sama bisa membuka aplikasi.
    host: true,
    // Permintaan /api diteruskan ke server Express, sehingga kode klien
    // cukup memakai jalur relatif dan tidak perlu tahu porta API.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:5177',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // three.js dipisah ke berkas sendiri supaya bisa di-cache terpisah dari kode twin.
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
    chunkSizeWarningLimit: 900,
  },
});
