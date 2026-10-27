import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    watch: {
      // 编辑器原子写入产生的临时目录会触发 Windows EBUSY，直接忽略
      ignored: ['**/*.tmpdir/**', '**/*.tmp', '**/dist/**', '**/artifacts/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
