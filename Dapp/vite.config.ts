import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  define: { global: 'globalThis' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      process: path.resolve(__dirname, 'node_modules/process/browser.js'),
      buffer: 'buffer',
      assert: 'assert',
      events: 'events',
      stream: 'stream-browserify',
      util: 'util',
    },
  },
  optimizeDeps: {
    include: [
      'process',
      'buffer',
      'util',
      'snarkjs',
      'circomlibjs',
      '@zk-kit/incremental-merkle-tree',
    ],
  },
  server: {
    fs: { allow: [path.resolve(__dirname, '..')] },
  },
})
